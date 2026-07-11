import { WebSocket } from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { tmpdir } from 'os'
import path from 'path'
import { mkdtempSync } from 'fs'
import { createServer } from '../src/server.js'

describe('ws auth and hello', () => {
  let baseUrl = ''
  let token = ''
  let sessionId = ''
  let close: (() => Promise<void>) | null = null
  const tmp = mkdtempSync(path.join(tmpdir(), 'gp-'))

  beforeAll(async () => {
    process.env.TOKEN = 'wstoken'
    process.env.PORT = '0'
    process.env.HOST = '127.0.0.1'
    process.env.TOKEN_FILE = path.join(tmp, 'token')
    process.env.MOCK_PTY = 'true'
    const { server, config, sessions } = await createServer()
    const created = sessions.create({ title: 'ws', useTmux: false, tmuxPrefix: 'gp', scrollbackLines: 100 })
    sessionId = created.id
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    if (address && typeof address === 'object') {
      baseUrl = `127.0.0.1:${address.port}`
    }
    token = config.token
    close = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  })

  afterAll(async () => {
    delete process.env.TOKEN
    delete process.env.PORT
    delete process.env.HOST
    delete process.env.TOKEN_FILE
    delete process.env.MOCK_PTY
    if (close) await close()
  })

  it('rejects bad token', async () => {
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://${baseUrl}/term?sessionId=${sessionId}&token=bad`)
      ws.on('close', (code) => {
        expect(code).toBe(4001)
        resolve()
      })
    })
  })

  it('sends hello on connect', async () => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://${baseUrl}/term?sessionId=${sessionId}&token=${token}`)
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'hello') {
            expect(msg.sessionId).toBe(sessionId)
            ws.close()
            resolve()
          }
        } catch (err) {
          reject(err)
        }
      })
      ws.on('error', (err) => reject(err))
    })
  })
})
