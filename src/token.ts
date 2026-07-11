import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { TokenSource } from './types.js'

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

function generateToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('hex')
}

export async function resolveToken(opts: TokenSource): Promise<string> {
  if (opts.envToken && opts.envToken.trim()) {
    return opts.envToken.trim()
  }

  const dir = path.dirname(opts.tokenFilePath)
  await ensureDir(dir)

  try {
    const existing = await fs.readFile(opts.tokenFilePath, 'utf8')
    const token = existing.trim()
    if (token) return token
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err
  }

  const token = generateToken()
  await fs.writeFile(opts.tokenFilePath, token, 'utf8')
  return token
}

export { generateToken }

export async function rotateTokenFile(tokenFilePath: string): Promise<string> {
  const token = generateToken()
  const dir = path.dirname(tokenFilePath)
  await ensureDir(dir)
  await fs.writeFile(tokenFilePath, token, 'utf8')
  return token
}
