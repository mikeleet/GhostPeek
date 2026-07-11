import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import request from 'supertest'
import { createServer } from '../src/server.js'

async function start(env: Record<string, string>) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'gp-'))
  const applied: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(env)) {
    applied[k] = process.env[k]
    process.env[k] = v
  }
  process.env.TOKEN_FILE = path.join(tmp, 'token')
  process.env.HOST = '127.0.0.1'
  process.env.PORT = '0'
  process.env.MOCK_PTY = 'true'

  const { server, config } = await createServer()
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address()
  const baseUrl = address && typeof address === 'object' ? `http://127.0.0.1:${address.port}` : ''
  const token = config.token
  const close = async () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))

  return { baseUrl, token, close, applied, tmp }
}

function restore(applied: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(applied)) {
    if (v === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = v
    }
  }
  delete process.env.TOKEN_FILE
  delete process.env.HOST
  delete process.env.PORT
  delete process.env.MOCK_PTY
}

describe('rotate-token', () => {
  it('rotates token when enabled and not env-based', async () => {
    const { baseUrl, token, close, applied } = await start({ ROTATE_TOKEN_ENABLED: 'true' })
    const res = await request(baseUrl).post('/rotate-token').set('authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.token).not.toBe(token)
    await close()
    restore(applied)
  })

  it('rejects rotate when disabled', async () => {
    const { baseUrl, token, close, applied } = await start({ ROTATE_TOKEN_ENABLED: 'false' })
    const res = await request(baseUrl).post('/rotate-token').set('authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
    await close()
    restore(applied)
  })

  it('rejects rotate when TOKEN env set', async () => {
    const { baseUrl, token, close, applied } = await start({ ROTATE_TOKEN_ENABLED: 'true', TOKEN: 'envtoken' })
    const res = await request(baseUrl).post('/rotate-token').set('authorization', `Bearer envtoken`)
    expect(res.status).toBe(400)
    await close()
    restore(applied)
  })
})
