import { describe, it, expect } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  it('uses defaults when env empty', async () => {
    const cfg = await loadConfig({ env: {} })
    expect(cfg.port).toBe(8787)
    expect(cfg.token.length).toBeGreaterThan(10)
  })

  it('respects env overrides', async () => {
    const cfg = await loadConfig({ env: { PORT: '9999', HOST: '127.0.0.1', TOKEN: 'abc123' } })
    expect(cfg.port).toBe(9999)
    expect(cfg.host).toBe('127.0.0.1')
    expect(cfg.token).toBe('abc123')
  })
})
