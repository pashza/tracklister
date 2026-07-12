export type ParsedTrack = {
  artist: string | null
  title: string
  query: string
}

const HEADER_RE =
  /^(?:[~*_=#\-–—\s]*track\s*list[~*_=#\-–—\s]*|[~*_=#\-–—]{3,}|playlist|setlist|tracklist)$/i

const NUMBER_PREFIX_RE = /^\s*(?:\d{1,3}[\.\)\-:]\s*|\d{1,3}\s+|\(\d{1,3}\)\s*)/

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function looksLikeHeader(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (HEADER_RE.test(trimmed)) return true
  if (/^[\W_]+$/u.test(trimmed) && trimmed.length < 40) return true
  return false
}

function splitArtistTitle(line: string): { artist: string | null; title: string } {
  const colon = line.match(/^(.+?)\s*:\s+(.+)$/)
  if (colon) {
    return { artist: clean(colon[1]), title: clean(colon[2]) }
  }

  const dash = line.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash) {
    return { artist: clean(dash[1]), title: clean(dash[2]) }
  }

  return { artist: null, title: clean(line) }
}

export function parseTracklist(text: string): ParsedTrack[] {
  const tracks: ParsedTrack[] = []
  const seen = new Set<string>()

  for (const original of text.split(/\r?\n/)) {
    let line = original.trim()
    if (looksLikeHeader(line)) continue

    line = line.replace(NUMBER_PREFIX_RE, '').trim()
    if (!line || looksLikeHeader(line)) continue

    const { artist, title } = splitArtistTitle(line)
    if (!title) continue

    const query = artist ? `${artist} ${title}` : title
    const key = query.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    tracks.push({ artist, title, query })
  }

  return tracks
}
