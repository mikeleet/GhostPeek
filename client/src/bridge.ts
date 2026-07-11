import { BridgeConfig, SessionInfo, WsMessage } from './types'

const WS_BASE = 'GhostPeekWS'

export type BridgeEvent = 'output' | 'exit' | 'hello' | 'open' | 'close' | 'error'
export type BridgeHandler = (data: string | undefined, meta?: SessionInfo) => void

export class BridgeClient {
  private config: BridgeConfig
  private sessionId: string | null = null
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private handlers = new Map<BridgeEvent, Set<BridgeHandler>>()

  constructor(config: BridgeConfig) {
    this.config = config
  }

  on(event: BridgeEvent, handler: BridgeHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
  }

  off(event: BridgeEvent, handler: BridgeHandler) {
    this.handlers.get(event)?.delete(handler)
  }

  private emit(event: BridgeEvent, data?: string, meta?: SessionInfo) {
    this.handlers.get(event)?.forEach((h) => h(data, meta))
  }

  async createSession(title?: string): Promise<SessionInfo> {
    const base = this.config.url.replace(/^ws/, 'http')
    const res = await fetch(`${base.replace(/\/$/, '')}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({ title: title || 'Terminal' }),
    })
    if (!res.ok) throw new Error(`create session failed: ${res.status}`)
    return (await res.json()) as SessionInfo
  }

  async listSessions(): Promise<SessionInfo[]> {
    const base = this.config.url.replace(/^ws/, 'http')
    const res = await fetch(`${base.replace(/\/$/, '')}/sessions`, {
      headers: { Authorization: `Bearer ${this.config.token}` },
    })
    if (!res.ok) throw new Error(`list sessions failed: ${res.status}`)
    return (await res.json()) as SessionInfo[]
  }

  async deleteSession(id: string): Promise<void> {
    const base = this.config.url.replace(/^ws/, 'http')
    const res = await fetch(`${base.replace(/\/$/, '')}/sessions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.config.token}` },
    })
    if (!res.ok && res.status !== 204) throw new Error(`delete session failed: ${res.status}`)
  }

  async setMode(sessionId: string, mode: 'build' | 'plan'): Promise<void> {
    const base = this.config.url.replace(/^ws/, 'http')
    await fetch(`${base.replace(/\/$/, '')}/sessions/${sessionId}/mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({ mode }),
    })
  }

  async setSlider(sessionId: string, value: number): Promise<void> {
    const base = this.config.url.replace(/^ws/, 'http')
    await fetch(`${base.replace(/\/$/, '')}/sessions/${sessionId}/slider`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({ value }),
    })
  }

  async fetchScrollback(sessionId: string, offset = 0, limit = 200): Promise<{ lines: string[]; total: number }> {
    const base = this.config.url.replace(/^ws/, 'http')
    const res = await fetch(`${base.replace(/\/$/, '')}/sessions/${sessionId}/scrollback?offset=${offset}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${this.config.token}` },
    })
    if (!res.ok) throw new Error(`scrollback failed: ${res.status}`)
    return (await res.json()) as { lines: string[]; total: number }
  }

  connect(sessionId: string): void {
    this.sessionId = sessionId
    const url = new URL(this.config.url)
    url.pathname = '/term'
    url.searchParams.set('sessionId', sessionId)
    url.searchParams.set('token', this.config.token)

    const ws = new WebSocket(url.toString())
    this.ws = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      this.emit('open', undefined, undefined)
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data.toString()) as WsMessage
        switch (msg.type) {
          case 'hello':
            this.emit('hello', undefined, msg.meta)
            break
          case 'output':
            this.emit('output', msg.data, undefined)
            break
          case 'exit':
            this.emit('exit', undefined, undefined)
            break
          case 'error':
            this.emit('error', msg.message || msg.error, undefined)
            break
          default:
            break
        }
      } catch {
        // binary or non-JSON ignored for now
      }
    }

    ws.onclose = () => {
      this.emit('close', undefined, undefined)
      this.scheduleReconnect()
    }

    ws.onerror = () => {
      this.emit('error', 'connection error', undefined)
    }
  }

  sendInput(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', data }))
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.sessionId = null
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    if (!this.sessionId) return
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect(this.sessionId!)
    }, 3000)
  }
}
