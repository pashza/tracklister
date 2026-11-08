import type { TrackLinks } from './search'

export type SavedSet = {
  id: string
  name: string
  source: string
  tracks: TrackLinks[]
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'tracklister.sets.v1'

export function loadSets(): SavedSet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const sets = raw ? (JSON.parse(raw) as SavedSet[]) : []
    return Array.isArray(sets) ? sets.sort((a, b) => b.updatedAt - a.updatedAt) : []
  } catch {
    return []
  }
}

function persist(sets: SavedSet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sets))
}

export function saveSet(set: SavedSet): SavedSet[] {
  const sets = loadSets().filter((existing) => existing.id !== set.id)
  sets.unshift({ ...set, updatedAt: Date.now() })
  persist(sets)
  return sets
}

export function deleteSet(id: string): SavedSet[] {
  const sets = loadSets().filter((set) => set.id !== id)
  persist(sets)
  return sets
}

export function newSetId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export type ImportPayload = {
  name?: string
  text: string
  source?: string
}

/** The Firefox extension opens `/#import=<base64url(JSON)>`. */
export function readImportFromHash(hash: string): ImportPayload | null {
  const match = hash.match(/^#import=(.+)$/)
  if (!match) return null
  try {
    const base64 = match[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as ImportPayload
    return typeof payload?.text === 'string' ? payload : null
  } catch {
    return null
  }
}
