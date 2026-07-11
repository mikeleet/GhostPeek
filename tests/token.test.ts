import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { resolveToken } from '../src/token.js'

describe('resolveToken', () => {
  it('returns env token when provided', async () => {
    const token = await resolveToken({ envToken: 'envtok', tokenFilePath: path.join(mkdtempSync(path.join(tmpdir(), 'gp-')), 't') })
    expect(token).toBe('envtok')
  })

  it('persists generated token when file missing', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gp-'))
    const file = path.join(dir, 'token')
    const token = await resolveToken({ tokenFilePath: file })
    const again = await resolveToken({ tokenFilePath: file })
    expect(token).toEqual(again)
    expect(token.length).toBeGreaterThan(16)
  })
})
