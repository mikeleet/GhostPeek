import { BridgeConfig, QrPayload } from './types'

const STORAGE_KEY = 'ghostpeek_config'

function loadEmbeddedConfig(): BridgeConfig | null {
  const env = import.meta.env as Record<string, string | undefined>
  const url = env.VITE_GHOSTPEEK_URL?.trim()
  const token = env.VITE_GHOSTPEEK_TOKEN?.trim()
  const label = env.VITE_GHOSTPEEK_LABEL?.trim() || 'GhostPeek'

  if (!url || !token) return null
  return { url, token, label }
}

export function loadConfig(): BridgeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as BridgeConfig
    if (cfg.url && cfg.token) return cfg
  } catch {
    // fall through to embedded config
  }

  return loadEmbeddedConfig()
}

export function saveConfig(cfg: BridgeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export async function resolveQrPayload(raw: string): Promise<QrPayload | null> {
  const trimmed = raw.trim()

  if (trimmed.startsWith('GHOSTPEEK_BOOTSTRAP:')) {
    const bootstrapUrl = trimmed.slice('GHOSTPEEK_BOOTSTRAP:'.length).trim()
    try {
      const res = await fetch(bootstrapUrl)
      if (!res.ok) return null
      const obj = (await res.json()) as QrPayload
      if (obj.url && obj.token) return obj
    } catch {
      return null
    }
  }

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
