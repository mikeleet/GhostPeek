export type Mode = 'build' | 'plan'

export interface BridgeConfig {
  host: string
  port: number
  token: string
  tokenFilePath: string
  tokenIsEnv: boolean
  workingDir: string
  startupCommand?: string
  useTmux: boolean
  tmuxSessionPrefix: string
  scrollbackLines: number
  rotateTokenEnabled: boolean
  tls: boolean
  mockPty: boolean
}

export interface TokenSource {
  envToken?: string
  tokenFilePath: string
}
