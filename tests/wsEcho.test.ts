import { WebSocket } from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { tmpdir } from 'os'
import path from 'path'
import { mkdtempSync } from 'fs'
import request from 'supertest'
import { createServer } from '../src/server.js'

describe('ws echo integration (mock pty)', () => {
  let baseUrl = ''
  let token = ''
  let sessionId = ''
  let close: (() => Promise<void>) | null = null
  const tmp = mkdtempSync(path.join(tmpdir(), 'gp-'))

  beforeAll(async () => {
    process.env.TOKEN = 'echotoken'
    process.env.PORT = '0'
    process.env.HOST = '127.0.0.1'
    process.env.TOKEN_FILE = path.join(tmp, 'token')
    process.env.MOCK_PTY = 'true'
    const { server, config } = await createServer()
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`
    }
    token = config.token
    // create a session via REST
    const res = await request(baseUrl)
      .post('/sessions')
      .set('authorization', `Bearer ${token}`)
      .send({ title: 'echo' })
    sessionId = res.body.id
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

  it('echoes input over ws', async () => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${baseUrl.replace('http://', 'ws://')}/term?sessionId=${sessionId}&token=${token}`)
      const timeout = setTimeout(() => reject(new Error('timeout')), 3000)
      ws.on('open', () => {
        // wait for hello before sending input
      })
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'hello') {
          ws.send(JSON.stringify({ type: 'input', data: 'hello-echo\n' }))
        }
        if (msg.type === 'output') {
          try {
            expect(msg.data).toContain('hello-echo')
            clearTimeout(timeout)
            ws.close()
            resolve()
          } catch (err) {
            clearTimeout(timeout)
            reject(err)
          }
        }
      })
      ws.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  })
})
