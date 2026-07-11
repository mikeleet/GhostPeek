import http from 'http'
import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import QRCode from 'qrcode'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadConfig } from './config.js'
import { buildBootstrapQrText, buildQrPayload } from './bootstrap.js'
import { BridgeConfig } from './types.js'
import { SessionManager } from './ptyManager.js'
import { rotateTokenFile } from './token.js'

function generatePairingPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function tokenFromRequest(req: express.Request): string | null {
  const auth = req.headers.authorization
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7)
  }
  const header = req.headers['x-ghostpeek-token']
  if (typeof header === 'string') return header
  if (Array.isArray(header)) return header[0]
  const q = req.query.token
  if (typeof q === 'string') return q
  return null
}

function makeAuthMiddleware(token: string): express.RequestHandler {
  return (req, res, next) => {
    const provided = tokenFromRequest(req)
    if (provided !== token) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    next()
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp(config: BridgeConfig, sessions: SessionManager, pairingPin: string) {
  const app = express()
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Ghostpeek-Token')

    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }

    next()
  })
  app.use(express.json())
  const publicDir = path.join(process.cwd(), 'public')
  app.use(express.static(publicDir))

  const requireAuth = makeAuthMiddleware(config.token)

  app.get('/health', (req, res) => {
    res.json({ ok: true })
  })

  app.get('/bootstrap', (_req, res) => {
    res.sendFile(path.join(publicDir, 'bootstrap.html'))
  })

  app.get('/bootstrap.json', (_req, res) => {
    res.json(buildQrPayload(config))
  })

  app.get('/pairing-info', (_req, res) => {
    res.json({
      host: config.host,
      port: config.port,
      pin: pairingPin,
      wsUrl: `${config.tls ? 'wss' : 'ws'}://${config.host}:${config.port}`,
    })
  })

  app.post('/pair', (req, res) => {
    const pin = String(req.body?.pin ?? '').trim()
    if (pin !== pairingPin) {
      return res.status(401).json({ error: 'invalid pin' })
    }
    return res.json(buildQrPayload(config))
  })

  app.post('/bootstrap.qr', async (req, res) => {
    const qrText = buildBootstrapQrText(config)
    const dataUrl = await QRCode.toDataURL(qrText)
    res.type('text/plain').send(dataUrl)
  })

  app.get('/sessions', requireAuth, (_req, res) => {
    res.json(sessions.list())
  })

  app.post('/sessions', requireAuth, (req, res) => {
    const session = sessions.create({
      title: req.body?.title,
      useTmux: !!config.useTmux,
      tmuxPrefix: config.tmuxSessionPrefix,
      scrollbackLines: config.scrollbackLines,
    })
    res.status(201).json(session)
  })

  app.patch('/sessions/:id', requireAuth, (req, res) => {
    const s = sessions.get(req.params.id)
    if (!s) return res.status(404).json({ error: 'not found' })
    if (typeof req.body?.title === 'string' && req.body.title.trim()) {
      try {
        sessions.setTitle(req.params.id, req.body.title.trim())
      } catch {
        return res.status(404).json({ error: 'not found' })
      }
    }
    return res.json(sessions.get(req.params.id))
  })

  app.delete('/sessions/:id', requireAuth, (req, res) => {
    const s = sessions.get(req.params.id)
    if (!s) return res.status(404).json({ error: 'not found' })
    sessions.close(req.params.id)
    res.status(204).end()
  })

  app.get('/sessions/:id/scrollback', requireAuth, (req, res) => {
    const offset = Number(req.query.offset || 0)
    const limit = Number(req.query.limit || 200)
    const slice = sessions.scrollback(req.params.id, offset, limit)
    if (!slice) return res.status(404).json({ error: 'not found' })
    res.json(slice)
  })

  app.post('/sessions/:id/mode', requireAuth, (req, res) => {
    const mode = req.body?.mode
    if (mode !== 'build' && mode !== 'plan') return res.status(400).json({ error: 'invalid mode' })
    try {
      sessions.setMode(req.params.id, mode)
      return res.json({ ok: true })
    } catch (err) {
      return res.status(404).json({ error: 'not found' })
    }
  })

  app.post('/sessions/:id/slider', requireAuth, (req, res) => {
    const value = Number(req.body?.value)
    if (Number.isNaN(value)) return res.status(400).json({ error: 'invalid value' })
    try {
      sessions.setSlider(req.params.id, value)
      return res.json({ ok: true })
    } catch (err) {
      return res.status(404).json({ error: 'not found' })
    }
  })

  app.post('/rotate-token', requireAuth, async (_req, res) => {
    if (!config.rotateTokenEnabled) {
      return res.status(403).json({ error: 'rotate-token disabled' })
    }
    if (config.tokenIsEnv) {
      return res.status(400).json({ error: 'rotation not allowed when TOKEN env is set' })
    }
    try {
      const newToken = await rotateTokenFile(config.tokenFilePath)
      config.token = newToken
      return res.json({ token: newToken })
    } catch (err) {
      return res.status(500).json({ error: 'failed to rotate token' })
    }
  })

  return app
}

export async function createServer() {
  const config = await loadConfig()
  const pairingPin = process.env.PAIRING_PIN?.trim() || generatePairingPin()
  const sessions = new SessionManager(config.scrollbackLines, config.mockPty)
  const app = createApp(config, sessions, pairingPin)
  const server = http.createServer(app)
  const wss = new WebSocketServer({ server, path: '/term' })

  const sessionClients = new Map<string, Set<WebSocket>>()

  sessions.on('output', ({ sessionId, data }) => {
    const set = sessionClients.get(sessionId)
    if (!set) return
    for (const client of set) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'output', sessionId, data }))
      }
    }
  })

  sessions.on('exit', ({ sessionId }) => {
    const set = sessionClients.get(sessionId)
    if (!set) return
    for (const client of set) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'exit', sessionId }))
        client.close()
      }
    }
    sessionClients.delete(sessionId)
  })

  wss.on('connection', (ws, req) => {
    try {
      const host = req.headers.host || `${config.host}:${config.port}`
      const url = new URL(req.url || '/', `ws://${host}`)
      const token = url.searchParams.get('token')
      if (token !== config.token) {
        ws.close(4001, 'unauthorized')
        return
      }
      const sessionId = url.searchParams.get('sessionId')
      if (!sessionId || !sessions.get(sessionId)) {
        ws.close(4004, 'session not found')
        return
      }
      let set = sessionClients.get(sessionId)
      if (!set) {
        set = new Set()
        sessionClients.set(sessionId, set)
      }
      set.add(ws)

      const meta = sessions.get(sessionId)
      ws.send(JSON.stringify({ type: 'hello', sessionId, meta }))

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'input' && typeof msg.data === 'string') {
            sessions.write(sessionId, msg.data)
          }
          if (msg.type === 'resize' && Number.isFinite(msg.cols) && Number.isFinite(msg.rows)) {
            sessions.resize(sessionId, msg.cols, msg.rows)
          }
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'bad message' }))
        }
      })

      ws.on('close', () => {
        const setForSession = sessionClients.get(sessionId)
        if (setForSession) {
          setForSession.delete(ws)
          if (setForSession.size === 0) {
            sessionClients.delete(sessionId)
          }
        }
      })
    } catch (err) {
      ws.close(1011, 'error')
    }
  })

  return { config, app, server, wss, sessions, pairingPin }
}

async function main() {
  const { server, config, pairingPin } = await createServer()
  server.listen(config.port, config.host, () => {
    // eslint-disable-next-line no-console
    console.log(`GhostPeek bridge listening on ${config.host}:${config.port}`)
    // eslint-disable-next-line no-console
    console.log(`GhostPeek pairing PIN: ${pairingPin}`)
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err)
    process.exit(1)
  })
}
