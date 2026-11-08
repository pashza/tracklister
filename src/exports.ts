import type { TrackLinks } from './search'

export type SetData = {
  name: string
  tracks: TrackLinks[]
}

/** YouTube's anonymous playlist endpoint accepts at most 50 video ids. */
const YOUTUBE_PLAYLIST_LIMIT = 50

export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url.trim())
    const host = parsed.hostname.replace(/^www\.|^m\.|^music\./, '')
    if (host === 'youtu.be') return parsed.pathname.slice(1).split('/')[0] || null
    if (host !== 'youtube.com') return null
    if (parsed.pathname === '/watch') return parsed.searchParams.get('v')
    const match = parsed.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/** Windows still trips over paths past 260 chars, so folder + file names stay short. */
export function sanitizeFileName(value: string, maxLength = 120): string {
  const cleaned = value
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .replace(/[. ]+$/, '')
  return cleaned || 'Untitled'
}

export function trackLabel(track: TrackLinks): string {
  return `${track.displayArtist} - ${track.displayTitle}`
}

/** "01 - Artist - Title" — the zero-padded prefix keeps folder order equal to set order. */
export function trackFileStem(track: TrackLinks, index: number, total: number, numbered: boolean): string {
  const label = sanitizeFileName(trackLabel(track))
  if (!numbered) return label
  const width = Math.max(2, String(total).length)
  return `${String(index + 1).padStart(width, '0')} - ${label}`
}

export function youtubePlaylistUrls(tracks: TrackLinks[]): string[] {
  const ids = tracks.map((track) => youtubeId(track.youtube)).filter((id): id is string => Boolean(id))
  const urls: string[] = []
  for (let i = 0; i < ids.length; i += YOUTUBE_PLAYLIST_LIMIT) {
    const chunk = ids.slice(i, i + YOUTUBE_PLAYLIST_LIMIT)
    urls.push(`https://www.youtube.com/watch_videos?video_ids=${chunk.join(',')}`)
  }
  return urls
}

function m3uTitle(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
}

/**
 * Streamable playlist: each entry is the YouTube URL, so VLC/mpv can play it as-is,
 * and the file doubles as a download list.
 */
export function buildYoutubeM3u(set: SetData): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${m3uTitle(set.name)}`]
  set.tracks.forEach((track) => {
    lines.push(`#EXTINF:-1,${m3uTitle(trackLabel(track))}`)
    if (track.spotify) lines.push(`# Spotify: ${track.spotify}`)
    lines.push(track.youtube ?? `# Not found on YouTube: ${m3uTitle(trackLabel(track))}`)
  })
  return lines.join('\n') + '\n'
}

function csvCell(value: string | null | undefined): string {
  const text = value ?? ''
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Soundiiz "Import from file" reads Title + Artist columns and matches on any platform. */
export function buildCsv(set: SetData): string {
  const rows = [['Title', 'Artist', 'Album', 'Playlist', 'YouTube', 'Spotify']]
  for (const track of set.tracks) {
    rows.push([track.displayTitle, track.displayArtist, '', set.name, track.youtube ?? '', track.spotify ?? ''])
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function buildText(set: SetData): string {
  const lines = [set.name, '']
  set.tracks.forEach((track, index) => {
    lines.push(`${index + 1}. ${trackLabel(track)}`)
    if (track.youtube) lines.push(`   ${track.youtube}`)
    if (track.spotify) lines.push(`   ${track.spotify}`)
  })
  return lines.join('\n') + '\n'
}

export function downloadFile(filename: string, content: BlobPart, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
