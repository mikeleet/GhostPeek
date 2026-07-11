export type Mode = 'build' | 'plan'

export interface QrPayload {
  url: string
  token: string
  label: string
  rotateEnabled?: boolean
}

export interface BridgeConfig {
  url: string
  token: string
  label?: string
}

export interface SessionInfo {
  id: string
  title: string
  mode: Mode
  slider: number
  createdAt: number
  unreadCount: number
}

export interface WsMessage {
  type: string
  sessionId?: string
  data?: string
  meta?: SessionInfo
  error?: string
  message?: string
  cols?: number
  rows?: number
}
