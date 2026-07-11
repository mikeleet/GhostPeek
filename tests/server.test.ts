import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createServer } from '../src/server.js'

describe('server auth', () => {
  let close: (() => Promise<void>) | null = null
  let baseUrl = ''
  let token = ''

  beforeAll(async () => {
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
    if (close) await close()
  })

  it('rejects without token', async () => {
    const res = await request(baseUrl).get('/sessions')
    expect(res.status).toBe(401)
  })

  it('allows with token', async () => {
    const res = await request(baseUrl).get('/sessions').set('authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})
