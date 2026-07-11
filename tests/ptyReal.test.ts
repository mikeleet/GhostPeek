import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SessionManager } from '../src/ptyManager.js'

const REAL = process.env.REAL_PTY_TEST === 'true'

// Optional real PTY test; skipped by default and in CI.
describe.skipIf(!REAL)('real PTY echo', () => {
  let mgr: SessionManager
  let sessionId: string

  beforeAll(() => {
    mgr = new SessionManager(200, false)
    const s = mgr.create({ title: 'real', useTmux: false, tmuxPrefix: 'gp', scrollbackLines: 200 })
    sessionId = s.id
  })

  afterAll(() => {
    mgr.close(sessionId)
  })

  it('echoes through shell', async () => {
    const chunks: string[] = []
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for echo')), 5000)
      mgr.on('output', ({ sessionId: sid, data }) => {
        if (sid !== sessionId) return
        chunks.push(data)
        if (chunks.join('').includes('ghostpeek-real-echo')) {
          clearTimeout(timer)
          resolve()
        }
      })
    })
    mgr.write(sessionId, 'echo ghostpeek-real-echo\n')
    await done
  })
})
