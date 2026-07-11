import './style.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { BridgeClient } from './bridge'
import { loadConfig, saveConfig, resolveQrPayload } from './config'
import { initGlasses, isOnGlasses, updateTerminal, renderStatusBar, onG2Event } from './glasses'
import { GestureMapper, decodeG2Event } from './gestures'
import type { QrPayload, SessionInfo } from './types'

// ── Terminal setup ──
const term = new Terminal({
  cursorBlink: true,
  cursorStyle: 'bar',
  fontSize: 14,
  fontFamily: "'Fira Code', 'JetBrains Mono', 'Menlo', monospace",
  theme: {
    background: '#0c1214',
    foreground: '#9df2c3',
    cursor: '#6cf289',
    selectionBackground: '#1a3a2a',
    black: '#1a2428',
    red: '#f26c6c',
    green: '#6cf289',
    yellow: '#f2c86c',
    blue: '#6cc2f2',
    magenta: '#c26cf2',
    cyan: '#6cf2c2',
    white: '#eaf2ee',
    brightBlack: '#3a4a50',
    brightRed: '#ff8c8c',
    brightGreen: '#9df2c3',
    brightYellow: '#ffe88c',
    brightBlue: '#8cd8ff',
    brightMagenta: '#e09dff',
    brightCyan: '#8cffe8',
    brightWhite: '#ffffff',
  },
  allowProposedApi: true,
  allowTransparency: false,
  cols: 80,
  rows: 24,
})

const fitAddon = new FitAddon()
term.loadAddon(fitAddon)

try {
  const webglAddon = new WebglAddon()
  term.loadAddon(webglAddon)
} catch {
  // WebGL not available, canvas fallback works fine
}

// ── ANSI stripping for G2 ──
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\r/g, '')
}

// ── State ──
let bridge: BridgeClient | null = null
let sessions: SessionInfo[] = []
let activeSession: SessionInfo | null = null
const gestures = new GestureMapper()

// ── DOM elements ──
const setupScreen = document.getElementById('setup-screen')!
const terminalScreen = document.getElementById('terminal-screen')!
const settingsScreen = document.getElementById('settings-screen')!
const setupStatus = document.getElementById('setup-status')!
const terminalContainer = document.getElementById('terminal-container')!
const statusBar = document.getElementById('status-bar')!
const controlBar = document.getElementById('control-bar')!
const settingsStatus = document.getElementById('settings-status')!
const pairHostInput = document.getElementById('pair-host') as HTMLInputElement
const pairPinInput = document.getElementById('pair-pin') as HTMLInputElement

function showScreen(name: 'setup' | 'terminal' | 'settings') {
  setupScreen.classList.toggle('active', name === 'setup')
  terminalScreen.classList.toggle('active', name === 'terminal')
  settingsScreen.classList.toggle('active', name === 'settings')
  if (name === 'terminal') {
    requestAnimationFrame(() => {
      try { fitAddon.fit() } catch {}
    })
  }
}

function normalizeWsUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed
  return `ws://${trimmed}`
}

function toHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
}

async function pairWithPin(hostInput: string, pin: string): Promise<QrPayload> {
  const wsUrl = normalizeWsUrl(hostInput)
  const baseUrl = toHttpUrl(wsUrl)
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: pin.trim() }),
  })

  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Invalid PIN' : `Pair failed (${res.status})`)
  }

  return (await res.json()) as QrPayload
}

// ── Setup / QR flow ──
document.getElementById('scan-btn')?.addEventListener('click', async () => {
  setupStatus.textContent = 'Opening camera...'
  setupStatus.className = 'status'
  try {
    const mod = await import('@evenrealities/even_hub_sdk')
    const evenBridge = await mod.waitForEvenAppBridge()
    const image = await evenBridge.captureImageFromCamera()
    if (!image?.base64) {
      setupStatus.textContent = 'No image captured'
      setupStatus.className = 'status error'
      return
    }
    const qrText = await decodeQRFromImage(image.base64)
    if (!qrText) {
      setupStatus.textContent = 'No QR code found'
      setupStatus.className = 'status error'
      return
    }
    const payload = await resolveQrPayload(qrText)
    if (!payload) {
      setupStatus.textContent = 'Invalid QR payload'
      setupStatus.className = 'status error'
      return
    }
    applyQrPayload(payload)
  } catch {
    setupStatus.textContent = 'Camera not available. Use manual entry.'
    setupStatus.className = 'status error'
  }
})

document.getElementById('pair-btn')?.addEventListener('click', async () => {
  setupStatus.textContent = 'Pairing...'
  setupStatus.className = 'status'
  try {
    const payload = await pairWithPin(pairHostInput.value, pairPinInput.value)
    applyQrPayload(payload)
  } catch (err) {
    setupStatus.textContent = err instanceof Error ? err.message : 'Pairing failed'
    setupStatus.className = 'status error'
  }
})

document.getElementById('manual-btn')?.addEventListener('click', () => {
  showScreen('settings')
  const cfg = loadConfig()
  if (cfg) {
    ;(document.getElementById('bridge-url') as HTMLInputElement).value = cfg.url
    ;(document.getElementById('bridge-token') as HTMLInputElement).value = cfg.token
  }
})

document.getElementById('save-btn')?.addEventListener('click', () => {
  const url = (document.getElementById('bridge-url') as HTMLInputElement).value.trim()
  const token = (document.getElementById('bridge-token') as HTMLInputElement).value.trim()
  if (!url || !token) {
    settingsStatus.textContent = 'URL and token required'
    settingsStatus.className = 'status error'
    return
  }
  saveConfig({ url, token })
  settingsStatus.textContent = 'Saved. Connecting...'
  settingsStatus.className = 'status good'
  connectBridge({ url, token })
})

document.getElementById('settings-back-btn')?.addEventListener('click', () => {
  showScreen(loadConfig() ? 'terminal' : 'setup')
})

function applyQrPayload(payload: QrPayload) {
  saveConfig({ url: payload.url, token: payload.token, label: payload.label })
  pairHostInput.value = payload.url.replace(/^wss?:\/\//, '')
  setupStatus.textContent = `Connected to ${payload.label}`
  setupStatus.className = 'status good'
  connectBridge({ url: payload.url, token: payload.token })
}

async function decodeQRFromImage(base64: string): Promise<string | null> {
  try {
    const { default: jsQR } = await import('jsqr')
    const img = await loadImage(base64)
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, img.width, img.height)
    const code = jsQR(imageData.data, img.width, img.height)
    return code?.data ?? null
  } catch {
    return prompt('QR could not be decoded. Paste the QR content:')
  }
}

function loadImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:image/jpeg;base64,${base64}`
  })
}

// ── Bridge connection ──
function connectBridge(cfg: { url: string; token: string }) {
  bridge?.disconnect()

  term.reset()
  term.writeln('GhostPeek \x1b[32m●\x1b[0m connecting...')

  bridge = new BridgeClient(cfg)

  bridge.on('open', () => {
    updateStatus('connected')
  })

  bridge.on('hello', (_data, meta) => {
    if (meta) {
      activeSession = meta
      updateStatus(meta.title || 'terminal')
    }
    term.reset()
    term.writeln(`\x1b[2mGhostPeek \x1b[32m●\x1b[0m ${meta?.title || 'terminal'}\x1b[0m`)

    bridge?.fetchScrollback(activeSession!.id).then((sb) => {
      for (const line of sb.lines) {
        term.writeln(line)
      }
    }).catch(() => {})

    renderControls()
    showScreen('terminal')
  })

  bridge.on('output', (data) => {
    if (!data) return
    term.write(data)
    // stream stripped text to G2 glasses
    if (isOnGlasses()) {
      const clean = stripAnsi(data)
      const lines = clean.split('\n').filter((l) => l)
      if (lines.length > 0) {
        updateTerminal(lines.slice(-20).join('\n'))
      }
    }
  })

  bridge.on('exit', () => {
    updateStatus('session ended')
    term.writeln('\r\n\x1b[31m[session closed]\x1b[0m')
  })

  bridge.on('close', () => {
    updateStatus('disconnected — reconnecting...')
  })

  bridge.on('error', (data) => {
    term.writeln(`\r\n\x1b[31m[error: ${data || 'unknown'}]\x1b[0m`)
  })

  bridge.createSession('GhostPeek')
    .then((s) => {
      sessions = [s]
      activeSession = s
      bridge!.connect(s.id)
    })
    .catch((err) => {
      term.writeln(`\r\n\x1b[31mFailed to connect: ${err.message}\x1b[0m`)
    })

  // ── Terminal input → bridge ──
  term.onData((data) => {
    bridge?.sendInput(data)
  })

  // ── Terminal resize → bridge ──
  term.onResize(({ cols, rows }) => {
    bridge?.resize(cols, rows)
  })

  // ── Initialize glasses if available ──
  initGlasses().then((ok) => {
    if (ok) {
      onG2Event((eventType) => {
        gestures.handleGesture(decodeG2Event(eventType))
      })
      renderStatusBar('GhostPeek | connected')
      updateTerminal('GhostPeek ready.')
    }
  })
}

// ── Status bar ──
function updateStatus(msg: string) {
  const mode = gestures.getMode()
  const slider = gestures.getSliderValue()
  statusBar.innerHTML = `
    <span>${msg}</span>
    <span class="mode-badge ${mode}">${mode}</span>
    <span style="font-size:11px;color:var(--text-muted)">slider:${slider}</span>
  `
  if (isOnGlasses()) {
    renderStatusBar(`${msg} ${mode}`)
  }
}

// ── Controls ──
function renderControls() {
  controlBar.innerHTML = `
    <button class="ctrl-btn ${gestures.isSliderMode() ? 'active' : ''}" id="slider-mode-btn">📏 slider</button>
    <button class="ctrl-btn" id="mode-btn">${gestures.getMode() === 'build' ? '🔨 build' : '📋 plan'}</button>
    <button class="ctrl-btn" id="keyboard-btn">⌨️ input</button>
  `

  document.getElementById('mode-btn')?.addEventListener('click', () => {
    gestures.handleGesture('double_press')
  })

  document.getElementById('slider-mode-btn')?.addEventListener('click', () => {
    gestures.toggleSliderMode()
    renderControls()
  })

  document.getElementById('keyboard-btn')?.addEventListener('click', () => {
    term.focus()
  })

  // Keyboard input row
  const inputRow = document.createElement('div')
  inputRow.id = 'input-row'
  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Type command...'
  const sendBtn = document.createElement('button')
  sendBtn.className = 'btn primary'
  sendBtn.style.cssText = 'width:auto;margin-bottom:0;'
  sendBtn.textContent = 'Send'

  const send = () => {
    if (!input.value) return
    bridge?.sendInput(input.value + '\n')
    input.value = ''
  }

  sendBtn.addEventListener('click', send)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send() })

  inputRow.appendChild(input)
  inputRow.appendChild(sendBtn)
  controlBar.appendChild(inputRow)

  // Slider
  const sliderRow = document.createElement('div')
  sliderRow.className = 'slider-row'
  const range = document.createElement('input')
  range.type = 'range'
  range.min = '0'
  range.max = '10'
  range.value = String(gestures.getSliderValue())
  const sliderLabel = document.createElement('span')
  sliderLabel.textContent = String(gestures.getSliderValue())

  range.addEventListener('input', () => {
    const val = Number(range.value)
    sliderLabel.textContent = String(val)
    while (gestures.getSliderValue() !== val) {
      gestures.handleGesture(val > gestures.getSliderValue() ? 'swipe_up' : 'swipe_down')
    }
    renderControls()
  })

  sliderRow.appendChild(range)
  sliderRow.appendChild(sliderLabel)
  controlBar.appendChild(sliderRow)
}

// ── Gesture handler ──
gestures.onChange((action, payload) => {
  if (!bridge || !activeSession) return

  switch (action) {
    case 'enter':
      bridge.sendInput('\n')
      break
    case 'mode_toggle':
      bridge.setMode(activeSession.id, payload as 'build' | 'plan')
      updateStatus(`tab:${activeSession.title} | ${payload}`)
      renderControls()
      break
    case 'scroll_up':
      term.scrollLines(-3)
      break
    case 'scroll_down':
      term.scrollLines(3)
      break
    case 'slider_change':
      bridge.setSlider(activeSession.id, payload as number)
      updateStatus(`${activeSession.title} | ${gestures.getMode()}`)
      renderControls()
      break
  }
})

// ── Mount terminal ──
term.open(terminalContainer)

const resizeObserver = new ResizeObserver(() => {
  try { fitAddon.fit() } catch {}
})
resizeObserver.observe(terminalContainer)

// ── Boot ──
function boot() {
  const cfg = loadConfig()
  if (cfg) {
    pairHostInput.value = cfg.url.replace(/^wss?:\/\//, '')
  }
  if (cfg) {
    connectBridge(cfg)
  } else {
    showScreen('setup')
  }
}

boot()
