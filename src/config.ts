import os from 'os'
import path from 'path'
import { BridgeConfig } from './types.js'
import { resolveToken } from './token.js'

const DEFAULT_PORT = 8787
const DEFAULT_SCROLLBACK = 5000
const DEFAULT_TOKEN_FILE = path.join(os.homedir(), '.ghostpeek', 'token')

function getDefaultHost(): string {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    const net = nets[name]
    if (!net) continue
    for (const iface of net) {
      if (!iface.internal && iface.family === 'IPv4') {
        return iface.address
      }
    }
  }
  return '0.0.0.0'
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<BridgeConfig> {
  const env = options.env ?? process.env
  const host = env.HOST || getDefaultHost()
  const port = Number(env.PORT || DEFAULT_PORT)
  const tokenFilePath = env.TOKEN_FILE || DEFAULT_TOKEN_FILE
  const token = await resolveToken({ envToken: env.TOKEN, tokenFilePath })
  const rotateTokenEnabled = env.ROTATE_TOKEN_ENABLED === 'true'
  const useTmux = env.USE_TMUX === 'true'
  const tmuxSessionPrefix = env.TMUX_SESSION_PREFIX || 'ghostpeek'
  const scrollbackLines = Number(env.SCROLLBACK_LINES || DEFAULT_SCROLLBACK)
  const tls = env.TLS === 'true'
  const mockPty = env.MOCK_PTY === 'true' || env.GHOSTPEEK_MOCK_PTY === 'true'
  const tokenIsEnv = !!(env.TOKEN && env.TOKEN.trim())

  return {
    host,
    port,
    token,
    tokenFilePath,
    tokenIsEnv,
    useTmux,
    tmuxSessionPrefix,
    scrollbackLines,
    rotateTokenEnabled,
    tls,
    mockPty,
  }
}
