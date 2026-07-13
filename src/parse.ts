export type ParsedTrack = {
  artist: string | null
  title: string
  query: string
}

const HEADER_RE =
  /^(?:[~*_=#\-–—\s]*track\s*list[~*_=#\-–—\s]*|[~*_=#\-–—]{3,}|playlist|setlist|tracklist)$/i

/** Disc / side / volume labels and similar section markers. */
const SECTION_RE =
  /^(?:cd|disc|disk|side|vinyl|lp|ep|vol(?:ume)?|part|pt)\s*[.\-_:]?\s*[a-z0-9]+$/i

/** "Atmos Guest Mix:", "Guest Mix", etc. */
const NAMED_SECTION_RE = /^.+\b(?:guest\s+)?(?:mix|set|playlist|tracklist|episode)\s*:?\s*$/i

/** Bare section label ending with a colon and nothing after. */
const COLON_LABEL_RE = /^.+:\s*$/

const NUMBER_PREFIX_RE = /^\s*(?:\d{1,3}[\.\)\-:]\s*|\d{1,3}\s+|\(\d{1,3}\)\s*)/

/** Orphan remix / version lines meant to continue the previous track. */
const CONTINUATION_RE = /^\([^)]+\)\.?$/

/** Trailing "(Label Records)" style suffixes — not part of the song title. */
const LABEL_SUFFIX_RE =
  /\s*\([^)]*\b(?:Records|Recordings|Music|Tales|Recordings?|Label)\)\s*$/i

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripLabelSuffix(title: string): string {
  // Keep remix/version tags; only drop label/catalog parentheses.
  if (/\b(remix|mix|edit|version|remaster|bootleg)\b/i.test(title.match(/\(([^)]+)\)\s*$/)?.[1] ?? '')) {
    return clean(title)
  }
  return clean(title.replace(LABEL_SUFFIX_RE, ''))
}

function looksLikeSectionOrHeader(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (HEADER_RE.test(trimmed)) return true
  if (SECTION_RE.test(trimmed)) return true
  if (NAMED_SECTION_RE.test(trimmed)) return true
  if (COLON_LABEL_RE.test(trimmed)) return true
  if (/^[\W_]+$/u.test(trimmed) && trimmed.length < 40) return true
  return false
}

function splitArtistTitle(line: string): { artist: string | null; title: string } | null {
  // "Artist: Title"
  const colon = line.match(/^(.+?)\s*:\s+(.+)$/)
  if (colon) {
    return { artist: clean(colon[1]), title: clean(colon[2]) }
  }

  // "Title ~ Artist" (common in psy/ambient lists)
  const tilde = line.match(/^(.+?)\s+~\s+(.+)$/)
  if (tilde) {
    return { artist: clean(tilde[2]), title: clean(tilde[1]) }
  }

  // "Artist - Title" or "Artist – Title"
  const spacedDash = line.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (spacedDash) {
    return { artist: clean(spacedDash[1]), title: clean(spacedDash[2]) }
  }

  // "Artist- Title" (no space before dash)
  const tightDash = line.match(/^(.+?\S)[-–—]\s+(.+)$/)
  if (tightDash) {
    return { artist: clean(tightDash[1]), title: clean(tightDash[2]) }
  }

  return null
}

function makeTrack(artist: string | null, title: string): ParsedTrack {
  const cleanArtist = artist ? clean(artist) : null
  const cleanTitle = stripLabelSuffix(title)
  return {
    artist: cleanArtist,
    title: cleanTitle,
    query: cleanArtist ? `${cleanArtist} ${cleanTitle}` : cleanTitle,
  }
}

export function parseTracklist(text: string): ParsedTrack[] {
  const tracks: ParsedTrack[] = []
  const seen = new Set<string>()

  for (const original of text.split(/\r?\n/)) {
    let line = original.trim()
    if (looksLikeSectionOrHeader(line)) continue

    // Append "(Remix Name)" lines to the previous track.
    if (CONTINUATION_RE.test(line) && tracks.length > 0) {
      const prev = tracks[tracks.length - 1]
      const addon = clean(line)
      const updated = makeTrack(prev.artist, `${prev.title} ${addon}`)
      seen.delete(prev.query.toLowerCase())
      if (!seen.has(updated.query.toLowerCase())) {
        seen.add(updated.query.toLowerCase())
        tracks[tracks.length - 1] = updated
      }
      continue
    }

    line = line.replace(NUMBER_PREFIX_RE, '').trim()
    if (!line || looksLikeSectionOrHeader(line)) continue
    if (CONTINUATION_RE.test(line)) continue

    const split = splitArtistTitle(line)
    if (!split) continue

    const track = makeTrack(split.artist, split.title)
    if (!track.title) continue

    const key = track.query.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tracks.push(track)
  }

  return tracks
}
