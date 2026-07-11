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

export async function resolveQrPayload(raw: string): Promise<QrPayload | null> {
  const trimmed = raw.trim()

  try {
    const obj = JSON.parse(trimmed)
    if (obj.url && obj.token) return obj as QrPayload
  } catch {
    // fall through to URL bootstrap flow
  }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    const res = await fetch(url.toString())
    if (!res.ok) return null
    const obj = (await res.json()) as QrPayload
    if (obj.url && obj.token) return obj
  } catch {
    return null
  }

  return null
}
