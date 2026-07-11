import { BridgeConfig, QrPayload } from './types'

const STORAGE_KEY = 'ghostpeek_config'

export function loadConfig(): BridgeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as BridgeConfig
    if (cfg.url && cfg.token) return cfg
    return null
  } catch {
    return null
  }
}

export function saveConfig(cfg: BridgeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function parseQrPayload(raw: string): QrPayload | null {
  try {
    const obj = JSON.parse(raw)
    if (obj.url && obj.token) return obj as QrPayload
    return null
  } catch {
    return null
  }
}
