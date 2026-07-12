import type { ParsedTrack } from './parse'

export type TrackLinks = {
  displayArtist: string
  displayTitle: string
  youtube: string
  spotify: string
  artwork: string | null
}

type ItunesSong = {
  trackName?: string
  artistName?: string
  artworkUrl100?: string
}

type ItunesResponse = {
  results?: ItunesSong[]
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreMatch(track: ParsedTrack, song: ItunesSong): number {
  const candidateArtist = normalize(song.artistName ?? '')
  const candidateTitle = normalize(song.trackName ?? '')
  const wantedArtist = normalize(track.artist ?? '')
  const wantedTitle = normalize(track.title)

  let score = 0

  if (wantedTitle && candidateTitle === wantedTitle) score += 5
  else if (wantedTitle && candidateTitle.includes(wantedTitle)) score += 3
  else if (wantedTitle && wantedTitle.includes(candidateTitle) && candidateTitle.length > 3)
    score += 2

  if (wantedArtist && candidateArtist === wantedArtist) score += 5
  else if (wantedArtist && candidateArtist.includes(wantedArtist)) score += 3
  else if (wantedArtist && wantedArtist.includes(candidateArtist) && candidateArtist.length > 2)
    score += 2

  return score
}

async function lookupItunes(track: ParsedTrack): Promise<ItunesSong | null> {
  const url = new URL('https://itunes.apple.com/search')
  url.searchParams.set('term', track.query)
  url.searchParams.set('media', 'music')
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', '8')

  try {
    const response = await fetch(url.toString())
    if (!response.ok) return null

    const data = (await response.json()) as ItunesResponse
    const results = data.results ?? []
    if (results.length === 0) return null

    let best: ItunesSong | null = null
    let bestScore = -1
    for (const song of results) {
      const score = scoreMatch(track, song)
      if (score > bestScore) {
        best = song
        bestScore = score
      }
    }

    return bestScore >= 3 ? best : null
  } catch {
    return null
  }
}

function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

function spotifySearchUrl(query: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`
}

export async function resolveTrack(track: ParsedTrack): Promise<TrackLinks> {
  const match = await lookupItunes(track)
  const displayArtist = match?.artistName ?? track.artist ?? 'Unknown artist'
  const displayTitle = match?.trackName ?? track.title
  const searchQuery = `${displayArtist} ${displayTitle}`

  return {
    displayArtist,
    displayTitle,
    youtube: youtubeSearchUrl(searchQuery),
    spotify: spotifySearchUrl(searchQuery),
    artwork: match?.artworkUrl100?.replace('100x100bb', '200x200bb') ?? null,
  }
}

export async function resolveAll(
  tracks: ParsedTrack[],
  onProgress?: (done: number, total: number, result: TrackLinks) => void,
): Promise<TrackLinks[]> {
  const results: TrackLinks[] = []

  for (let i = 0; i < tracks.length; i++) {
    const result = await resolveTrack(tracks[i])
    results.push(result)
    onProgress?.(i + 1, tracks.length, result)

    if (i < tracks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }

  return results
}

export function formatClipboardLinks(results: TrackLinks[]): string {
  return results
    .map(
      (r, i) =>
        `${i + 1}. ${r.displayArtist} – ${r.displayTitle}\n${r.youtube}\n${r.spotify}`,
    )
    .join('\n\n')
}

export function formatYoutubeLinks(results: TrackLinks[]): string {
  return results.map((r) => r.youtube).join('\n')
}

export function formatMarkdownLinks(results: TrackLinks[]): string {
  return results
    .map(
      (r, i) =>
        `${i + 1}. **${r.displayArtist} – ${r.displayTitle}** — [YouTube](${r.youtube}) · [Spotify](${r.spotify})`,
    )
    .join('\n')
}
