import './style.css'
import Convert from 'ansi-to-html'
import { BridgeClient } from './bridge'
import { loadConfig, saveConfig, clearConfig, parseQrPayload } from './config'
import { initGlasses, isOnGlasses, renderTerminal, updateTerminal, renderStatusBar, onG2Event } from './glasses'
import { GestureMapper, decodeG2Event } from './gestures'
import type { QrPayload, SessionInfo } from './types'

const ansiConvert = new Convert({ fg: '#9df2c3', bg: '#0f181b', newline: true })

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

// ── State ──
let bridge: BridgeClient | null = null
let sessions: SessionInfo[] = []
let activeSession: SessionInfo | null = null
let scrollOffset = 0
const SCROLL_STEP = 10
const VIEWPORT_LINES = 24
let outputBuffer: string[] = []
const gestures = new GestureMapper()

// ── DOM elements ──
const setupScreen = document.getElementById('setup-screen')!
const terminalScreen = document.getElementById('terminal-screen')!
const settingsScreen = document.getElementById('settings-screen')!
const setupStatus = document.getElementById('setup-status')!
const terminalView = document.getElementById('terminal-view')!
const statusBar = document.getElementById('status-bar')!
const controlBar = document.getElementById('control-bar')!
const settingsStatus = document.getElementById('settings-status')!

function showScreen(name: 'setup' | 'terminal' | 'settings') {
  setupScreen.classList.toggle('active', name === 'setup')
  terminalScreen.classList.toggle('active', name === 'terminal')
  settingsScreen.classList.toggle('active', name === 'settings')
}

// ── Setup / QR flow ──
document.getElementById('scan-btn')?.addEventListener('click', async () => {
  setupStatus.textContent = 'Opening camera...'
  setupStatus.className = 'status'
  try {
    // Even SDK: captureImageFromCamera
    const mod = await import('@evenrealities/even_hub_sdk')
    const bridge = await mod.waitForEvenAppBridge()
    const image = await bridge.captureImageFromCamera()
    if (!image?.base64) {
      setupStatus.textContent = 'No image captured'
      setupStatus.className = 'status error'
      return
    }
    // Decode QR from image
    const qrText = await decodeQRFromImage(image.base64)
    if (!qrText) {
      setupStatus.textContent = 'No QR code found in image'
      setupStatus.className = 'status error'
      return
    }
    const payload = parseQrPayload(qrText)
    if (!payload) {
      setupStatus.textContent = 'Invalid QR payload'
      setupStatus.className = 'status error'
      return
    }
    applyQrPayload(payload)
  } catch (err) {
    setupStatus.textContent = 'Camera not available. Use manual entry.'
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
  const cfg = loadConfig()
  if (cfg) {
    showScreen('terminal')
  } else {
    showScreen('setup')
  }
})

function applyQrPayload(payload: QrPayload) {
  saveConfig({ url: payload.url, token: payload.token, label: payload.label })
  setupStatus.textContent = `Connected to ${payload.label}`
  setupStatus.className = 'status good'
  connectBridge({ url: payload.url, token: payload.token })
}

// ── QR decoding (using JSQR if available, else fallback) ──
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
    // fallback: ask user to enter payload manually
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
  bridge = new BridgeClient(cfg)

  bridge.on('open', () => {
    updateStatus('connected')
  })

  bridge.on('hello', (_data, meta) => {
    if (meta) {
      activeSession = meta
      updateStatus(`${meta.title} | ${meta.mode}`)
    }
    // fetch scrollback
    bridge?.fetchScrollback(activeSession!.id).then((sb) => {
      outputBuffer = sb.lines
      scrollOffset = Math.max(0, outputBuffer.length - VIEWPORT_LINES)
      renderOutput()
    }).catch(() => {})
  })

  bridge.on('output', (data) => {
    if (!data) return
    const lines = data.split(/\r?\n/)
    for (const line of lines) {
      if (line) outputBuffer.push(line)
    }
    // auto-scroll to bottom
    scrollOffset = Math.max(0, outputBuffer.length - VIEWPORT_LINES)
    renderOutput()
  })

  bridge.on('exit', () => {
    updateStatus('session ended')
    outputBuffer.push('[session closed]')
    renderOutput()
  })

  bridge.on('close', () => {
    updateStatus('disconnected')
  })

  bridge.on('error', (data) => {
    updateStatus(`error: ${data || 'unknown'}`)
  })

  // Create session and connect
  bridge.createSession('GhostPeek')
    .then((s) => {
      sessions = [s]
      activeSession = s
      bridge!.connect(s.id)
      renderControls()
      showScreen('terminal')
    })
    .catch((err) => {
      setupStatus.textContent = `Failed: ${err.message}`
      setupStatus.className = 'status error'
    })

  // Initialize glasses if available
  initGlasses().then((ok) => {
    if (ok) {
      onG2Event((eventType, _containerID) => {
        const gesture = decodeG2Event(eventType)
        gestures.handleGesture(gesture)
      })
      renderTerminal('GhostPeek ready.\n')
      renderStatusBar('GhostPeek | connected')
    }
  })
}

// ── Output rendering ──
function renderOutput() {
  const slice = outputBuffer.slice(scrollOffset, scrollOffset + VIEWPORT_LINES)
  const raw = slice.join('\n') || '...'
  terminalView.innerHTML = ansiConvert.toHtml(raw)

  // also push to glasses if active (strip ANSI for monochrome G2 display)
  if (isOnGlasses()) {
    updateTerminal(stripAnsi(raw))
  }
}

function updateStatus(msg: string) {
  statusBar.textContent = msg
  if (isOnGlasses()) {
    renderStatusBar(msg)
  }
}

// ── Controls ──
function renderControls() {
  controlBar.innerHTML = `
    <button class="ctrl-btn" id="mode-btn">${gestures.getMode()}</button>
    <button class="ctrl-btn" id="tab-prev">◀ tab</button>
    <button class="ctrl-btn" id="tab-next">tab ▶</button>
    <button class="ctrl-btn ${gestures.isSliderMode() ? 'active' : ''}" id="slider-mode-btn">slider:${gestures.getSliderValue()}</button>
  `

  document.getElementById('mode-btn')?.addEventListener('click', () => {
    gestures.handleGesture('double_press')
  })

  document.getElementById('slider-mode-btn')?.addEventListener('click', () => {
    gestures.toggleSliderMode()
    renderControls()
  })

  document.getElementById('tab-prev')?.addEventListener('click', () => {
    document.getElementById('tab-prev')?.classList.add('active')
    setTimeout(() => document.getElementById('tab-prev')?.classList.remove('active'), 150)
  })

  document.getElementById('tab-next')?.addEventListener('click', () => {
    document.getElementById('tab-next')?.classList.add('active')
    setTimeout(() => document.getElementById('tab-next')?.classList.remove('active'), 150)
  })

  // Input row
  const inputRow = document.createElement('div')
  inputRow.id = 'input-row'
  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Type command...'
  const sendBtn = document.createElement('button')
  sendBtn.className = 'btn primary'
  sendBtn.style.width = 'auto'
  sendBtn.style.marginBottom = '0'
  sendBtn.textContent = 'Send'

  const send = () => {
    const val = input.value + '\n'
    if (val.trim()) {
      bridge?.sendInput(val)
      outputBuffer.push(`> ${val.trim()}`)
      scrollOffset = Math.max(0, outputBuffer.length - VIEWPORT_LINES)
      renderOutput()
    }
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
    // update local gesture state
    for (let i = 0; i < Math.abs(val - gestures.getSliderValue()); i++) {
      if (val > gestures.getSliderValue()) {
        gestures.handleGesture('swipe_up')
      } else {
        gestures.handleGesture('swipe_down')
      }
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
      updateStatus(`${activeSession.title} | ${payload}`)
      renderControls()
      break
    case 'scroll_up':
      scrollOffset = Math.max(0, scrollOffset - SCROLL_STEP)
      renderOutput()
      break
    case 'scroll_down':
      scrollOffset = Math.min(outputBuffer.length - VIEWPORT_LINES, scrollOffset + SCROLL_STEP)
      renderOutput()
      break
    case 'slider_change':
      bridge.setSlider(activeSession.id, payload as number)
      updateStatus(`${activeSession.title} | ${gestures.getMode()} | slider:${payload}`)
      renderControls()
      break
    default:
      break
  }
})

// ── Boot ──
function boot() {
  const cfg = loadConfig()
  if (cfg) {
    connectBridge(cfg)
  } else {
    showScreen('setup')
  }
}

boot()
