import { BridgeConfig } from './types.js'

export interface QrPayload {
  url: string
  token: string
  label: string
  rotateEnabled?: boolean
}

export function buildQrPayload(config: BridgeConfig): QrPayload {
  const proto = config.tls ? 'wss' : 'ws'
  const url = `${proto}://${config.host}:${config.port}`
  return {
    url,
    token: config.token,
    label: 'GhostPeek',
    rotateEnabled: config.rotateTokenEnabled && !config.tokenIsEnv,
  }
}
