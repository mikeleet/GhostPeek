import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { tmpdir } from 'os'
import path from 'path'
import { mkdtempSync } from 'fs'
import { createServer } from '../src/server.js'

describe('/bootstrap.json', () => {
  let baseUrl = ''
  let token = ''
  let close: (() => Promise<void>) | null = null
  const tmp = mkdtempSync(path.join(tmpdir(), 'gp-'))

  beforeAll(async () => {
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
    close = () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  })

  afterAll(async () => {
    delete process.env.PORT
    delete process.env.HOST
    delete process.env.TOKEN_FILE
    delete process.env.MOCK_PTY
    if (close) await close()
  })

  it('returns payload with url and token', async () => {
    const res = await request(baseUrl).get('/bootstrap.json')
    expect(res.status).toBe(200)
    expect(res.body.url).toContain('ws://')
    expect(res.body.token).toBe(token)
    expect(res.body.label).toBe('GhostPeek')
    expect(typeof res.body.rotateEnabled).toBe('boolean')
  })
})
