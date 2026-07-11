import { BridgeConfig } from './types.js'

export interface QrPayload {
  url: string
  token: string
  label: string
  rotateEnabled?: boolean
}

export function buildBootstrapUrl(config: BridgeConfig): string {
  const proto = config.tls ? 'https' : 'http'
  return `${proto}://${config.host}:${config.port}/bootstrap.json`
}

export function buildBootstrapQrText(config: BridgeConfig): string {
  return `GHOSTPEEK_BOOTSTRAP:${buildBootstrapUrl(config)}`
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
