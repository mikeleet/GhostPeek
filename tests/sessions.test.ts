import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { tmpdir } from 'os'
import path from 'path'
import { mkdtempSync } from 'fs'
import { createServer } from '../src/server.js'

describe('sessions REST', () => {
  let baseUrl = ''
  let token = ''
  let close: (() => Promise<void>) | null = null
  const tmp = mkdtempSync(path.join(tmpdir(), 'gp-'))

  beforeAll(async () => {
    process.env.TOKEN = 'resttoken'
    process.env.PORT = '0'
    process.env.HOST = '127.0.0.1'
    process.env.TOKEN_FILE = path.join(tmp, 'token')
    process.env.MOCK_PTY = 'true'
    const { server, config, sessions } = await createServer()
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`
    }
    token = config.token
    // ensure at least one session for later scrollback
    sessions.create({ title: 'rest', useTmux: false, tmuxPrefix: 'gp', scrollbackLines: 100 })
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

  it('creates and lists sessions', async () => {
    const createRes = await request(baseUrl)
      .post('/sessions')
      .set('authorization', `Bearer ${token}`)
      .send({ title: 'new session' })
    expect(createRes.status).toBe(201)
    const listRes = await request(baseUrl).get('/sessions').set('authorization', `Bearer ${token}`)
    expect(listRes.status).toBe(200)
    expect(Array.isArray(listRes.body)).toBe(true)
    expect(listRes.body.length).toBeGreaterThanOrEqual(2)
  })

  it('returns scrollback slice', async () => {
    // use the first session in list
    const listRes = await request(baseUrl).get('/sessions').set('authorization', `Bearer ${token}`)
    const first = listRes.body[0]
    const scroll = await request(baseUrl)
      .get(`/sessions/${first.id}/scrollback`)
      .set('authorization', `Bearer ${token}`)
    expect(scroll.status).toBe(200)
    expect(scroll.body).toHaveProperty('lines')
    expect(Array.isArray(scroll.body.lines)).toBe(true)
  })

  it('updates mode and slider', async () => {
    const listRes = await request(baseUrl).get('/sessions').set('authorization', `Bearer ${token}`)
    const first = listRes.body[0]
    const modeRes = await request(baseUrl)
      .post(`/sessions/${first.id}/mode`)
      .set('authorization', `Bearer ${token}`)
      .send({ mode: 'plan' })
    expect(modeRes.status).toBe(200)

    const sliderRes = await request(baseUrl)
      .post(`/sessions/${first.id}/slider`)
      .set('authorization', `Bearer ${token}`)
      .send({ value: 5 })
    expect(sliderRes.status).toBe(200)
  })
})
