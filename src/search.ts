import type { ParsedTrack } from './parse'

export type TrackLinks = {
  displayArtist: string
  displayTitle: string
  youtube: string | null
  youtubeTitle: string | null
  spotify: string | null
  artwork: string | null
}

type ProgressEvent = {
  done: number
  total: number
  result: TrackLinks
  error?: string
}

export function hasAnyLink(result: TrackLinks): boolean {
  return Boolean(result.youtube || result.spotify)
}

export async function resolveAll(
  tracks: ParsedTrack[],
  onProgress?: (done: number, total: number, result: TrackLinks) => void,
): Promise<TrackLinks[]> {
  const response = await fetch('/api/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracks }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Resolve failed (${response.status})`)
  }

  if (!response.body) {
    throw new Error('No response body from resolve API')
  }

  const results: TrackLinks[] = []
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      if (!line) continue

      const event = JSON.parse(line) as ProgressEvent
      if (event.error) throw new Error(event.error)
      results.push(event.result)
      onProgress?.(event.done, event.total, event.result)
    }
  }

  const trailing = buffer.trim()
  if (trailing) {
    const event = JSON.parse(trailing) as ProgressEvent
    if (event.error) throw new Error(event.error)
    results.push(event.result)
    onProgress?.(event.done, event.total, event.result)
  }

  return results
}

/** Plain list of direct URLs only (YouTube, then Spotify when present). */
export function formatDirectLinks(results: TrackLinks[]): string {
  const urls: string[] = []
  for (const result of results) {
    if (result.youtube) urls.push(result.youtube)
    if (result.spotify) urls.push(result.spotify)
  }
  return urls.join('\n')
}
