import { EventEmitter } from 'events'
import crypto from 'crypto'
import { spawn, IPty, IDisposable } from 'node-pty'

import type { Mode } from './types.js'

export interface SessionMeta {
  id: string
  title: string
  mode: Mode
  slider: number
  createdAt: number
}

export interface SessionInfo extends SessionMeta {
  unreadCount: number
}

export interface SessionCreateOptions {
  title?: string
  useTmux: boolean
  tmuxPrefix: string
  scrollbackLines: number
}

export interface ScrollbackSlice {
  lines: string[]
  total: number
}

interface SessionState {
  meta: SessionMeta
  pty: IPty
  buffer: string[]
  remainder: string
  clients: number
}

export interface OutputEvent {
  sessionId: string
  data: string
}

export interface ExitEvent {
  sessionId: string
  code: number
}

export declare interface SessionManager {
  on(event: 'output', listener: (evt: OutputEvent) => void): this
  on(event: 'exit', listener: (evt: ExitEvent) => void): this
}

export class SessionManager extends EventEmitter {
  private sessions = new Map<string, SessionState>()
  private scrollbackLines: number
  private mock: boolean

  constructor(scrollbackLines: number, mock = false) {
    super()
    this.scrollbackLines = scrollbackLines
    this.mock = mock
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({
      ...s.meta,
      unreadCount: 0,
    }))
  }

  get(id: string): SessionInfo | undefined {
    const s = this.sessions.get(id)
    if (!s) return undefined
    return { ...s.meta, unreadCount: 0 }
  }

  create(opts: SessionCreateOptions): SessionInfo {
    const id = crypto.randomUUID()
    const title = opts.title?.trim() || `Session ${this.sessions.size + 1}`
    const mode: Mode = 'build'
    const slider = 0
    const createdAt = Date.now()

    const pty = this.spawnPty(id, opts)
    const state: SessionState = {
      meta: { id, title, mode, slider, createdAt },
      pty,
      buffer: [],
      remainder: '',
      clients: 0,
    }

    pty.onData((data) => this.onData(state, data))
    pty.onExit(({ exitCode }) => this.onExit(state, exitCode))

    this.sessions.set(id, state)
    return { ...state.meta, unreadCount: 0 }
  }

  private spawnPty(id: string, opts: SessionCreateOptions): IPty {
    if (this.mock) {
      return createMockPty()
    }
    const shell = process.env.SHELL || '/bin/bash'
    if (opts.useTmux) {
      const sessionName = `${opts.tmuxPrefix}-${id}`
      return spawn('tmux', ['new-session', '-A', '-D', '-s', sessionName], {
        name: 'xterm-256color',
        cols: 120,
        rows: 32,
        cwd: process.cwd(),
        env: process.env,
      })
    }

    return spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 32,
      cwd: process.cwd(),
      env: process.env,
    })
  }

  private onData(state: SessionState, chunk: string) {
    const combined = state.remainder + chunk
    const parts = combined.split(/\r?\n/)
    state.remainder = parts.pop() || ''
    for (const line of parts) {
      state.buffer.push(line)
      if (state.buffer.length > this.scrollbackLines) {
        state.buffer.shift()
      }
    }
    this.emit('output', { sessionId: state.meta.id, data: chunk })
  }

  private onExit(state: SessionState, code: number) {
    if (state.remainder) {
      state.buffer.push(state.remainder)
      if (state.buffer.length > this.scrollbackLines) {
        state.buffer.shift()
      }
      state.remainder = ''
    }
    this.emit('exit', { sessionId: state.meta.id, code })
    this.sessions.delete(state.meta.id)
  }

  scrollback(id: string, offset = 0, limit = 200): ScrollbackSlice | null {
    const s = this.sessions.get(id)
    if (!s) return null
    const total = s.buffer.length
    const start = Math.max(0, offset)
    const end = Math.min(total, start + limit)
    return { lines: s.buffer.slice(start, end), total }
  }

  write(id: string, data: string) {
    const s = this.sessions.get(id)
    if (!s) throw new Error('session not found')
    s.pty.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    const s = this.sessions.get(id)
    if (!s) throw new Error('session not found')
    s.pty.resize(cols, rows)
  }

  close(id: string) {
    const s = this.sessions.get(id)
    if (!s) return
    s.pty.kill()
    this.sessions.delete(id)
  }

  setMode(id: string, mode: Mode) {
    const s = this.sessions.get(id)
    if (!s) throw new Error('session not found')
    s.meta.mode = mode
  }

  setSlider(id: string, value: number) {
    const s = this.sessions.get(id)
    if (!s) throw new Error('session not found')
    s.meta.slider = value
  }

  setTitle(id: string, title: string) {
    const s = this.sessions.get(id)
    if (!s) throw new Error('session not found')
    s.meta.title = title
  }
}

// Minimal mock PTY for tests
class MockPty extends EventEmitter implements IPty {
  process = 'mock'
  pid = -1
  cols = 120
  rows = 32
  readable = true
  writable = true
  handleFlowControl = false

  write(data: string | Buffer) {
    // Echo back data to simulate output
    queueMicrotask(() => this.emit('data', data))
  }
  resize(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
  }
  kill() {
    queueMicrotask(() => this.emit('exit', { exitCode: 0, signal: undefined }))
  }
  clear() {}
  pause() {}
  resume() {}
  onData: (listener: (data: string) => void) => IDisposable = (listener) => {
    this.on('data', listener)
    return { dispose: () => this.off('data', listener) }
  }
  onExit: (listener: (evt: { exitCode: number; signal?: number }) => void) => IDisposable = (listener) => {
    this.on('exit', listener)
    return { dispose: () => this.off('exit', listener) }
  }
}

function createMockPty(): IPty {
  return new MockPty()
}
