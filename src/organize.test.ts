import { describe, expect, it } from 'vitest'
import { buildCsv, buildYoutubeM3u, sanitizeFileName, youtubeId, youtubePlaylistUrls } from './exports'
import {
  buildLocalM3u,
  buildMacScript,
  buildWindowsScript,
  matchFiles,
  planMoves,
  toAudioFiles,
} from './organize'
import type { TrackLinks } from './search'

function track(artist: string, title: string, youtubeTitle: string | null = null, id = 'abc123def45'): TrackLinks {
  return {
    displayArtist: artist,
    displayTitle: title,
    youtube: `https://www.youtube.com/watch?v=${id}`,
    youtubeTitle,
    spotify: null,
    artwork: null,
  }
}

function file(path: string): File {
  const f = new File(['x'], path.split('/').pop()!)
  Object.defineProperty(f, 'webkitRelativePath', { value: path })
  return f
}

const set = {
  name: 'Peggy Gou: Boiler Room / 2026',
  tracks: [
    track('Bicep', 'Glue', 'Bicep - Glue (Official Video)', 'aaaaaaaaaaa'),
    track('Fred again..', 'Delilah (pull me out of this)', 'Fred again.. - Delilah (pull me out of this)', 'bbbbbbbbbbb'),
    track('Four Tet', 'Baby', 'Four Tet - Baby', 'ccccccccccc'),
    track('Peggy Gou', "It's 100% Me", null, 'ddddddddddd'),
  ],
}

describe('exports', () => {
  it('extracts YouTube ids from common link shapes', () => {
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=3')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://soundcloud.com/x')).toBeNull()
  })

  it('splits YouTube playlists into chunks of 50', () => {
    const many = Array.from({ length: 120 }, (_, i) => track('A', `T${i}`, null, `id${i}`))
    const urls = youtubePlaylistUrls(many)
    expect(urls).toHaveLength(3)
    expect(urls[0]).toMatch(/^https:\/\/www\.youtube\.com\/watch_videos\?video_ids=id0,id1,/)
  })

  it('sanitizes file names for Windows and macOS', () => {
    expect(sanitizeFileName('Peggy Gou: Boiler Room / 2026.')).toBe('Peggy Gou Boiler Room 2026')
  })

  it('writes CSV and a streamable m3u8', () => {
    expect(buildCsv(set).split('\r\n')[0]).toBe('Title,Artist,Album,Playlist,YouTube,Spotify')
    const m3u = buildYoutubeM3u(set)
    expect(m3u).toContain('#EXTINF:-1,Bicep - Glue\nhttps://www.youtube.com/watch?v=aaaaaaaaaaa')
  })
})

describe('organize', () => {
  const files = toAudioFiles([
    file('Downloads/Bicep - Glue (Official Video).mp3'),
    file('Downloads/Delilah (pull me out of this).mp3'),
    file('Downloads/Four Tet - Morning Side.mp3'),
    file('Downloads/Four Tet - Baby.m4a'),
    file('Downloads/cover.jpg'),
    file('Downloads/Some Other Artist - Unrelated.mp3'),
  ])

  it('only keeps audio files and strips the picked folder name', () => {
    expect(files.map((f) => f.path)).toEqual([
      'Bicep - Glue (Official Video).mp3',
      'Delilah (pull me out of this).mp3',
      'Four Tet - Morning Side.mp3',
      'Four Tet - Baby.m4a',
      'Some Other Artist - Unrelated.mp3',
    ])
  })

  it('matches downloads to tracks without mixing up same-artist songs', () => {
    const result = matchFiles(set.tracks, files).map((a) => a.file?.path ?? null)
    expect(result).toEqual([
      'Bicep - Glue (Official Video).mp3',
      'Delilah (pull me out of this).mp3',
      'Four Tet - Baby.m4a',
      null,
    ])
  })

  it('plans numbered targets and writes playlist + scripts', () => {
    const moves = planMoves(set, matchFiles(set.tracks, files), { numbered: true })
    expect(moves.map((m) => m.target)).toEqual([
      '01 - Bicep - Glue.mp3',
      '02 - Fred again.. - Delilah (pull me out of this).mp3',
      '03 - Four Tet - Baby.m4a',
    ])

    const m3u = buildLocalM3u(set, moves)
    expect(m3u).toContain('#EXTINF:-1,Bicep - Glue\n01 - Bicep - Glue.mp3')
    expect(m3u).toContain("# Missing: Peggy Gou - It's 100% Me")

    const mac = buildMacScript(set, moves)
    expect(mac).toContain("mkdir -p 'Peggy Gou Boiler Room 2026'")
    expect(mac).toContain(
      "mv -n 'Four Tet - Baby.m4a' 'Peggy Gou Boiler Room 2026/03 - Four Tet - Baby.m4a'",
    )

    const win = buildWindowsScript(set, moves)
    expect(win).toContain('\r\n')
    expect(win).toContain(
      'move "Four Tet - Baby.m4a" "Peggy Gou Boiler Room 2026\\03 - Four Tet - Baby.m4a"',
    )
  })

  it('escapes shell and batch special characters', () => {
    const tricky = { name: "DJ's 100% set", tracks: [track("Guns N' Roses", 'Sweet 100%')] }
    const moves = planMoves(tricky, [{ file: toAudioFiles([file("x/Guns N' Roses 100%.mp3")])[0], score: 1 }], {
      numbered: false,
    })
    expect(buildMacScript(tricky, moves)).toContain(`'Guns N'\\'' Roses 100%.mp3'`)
    expect(buildWindowsScript(tricky, moves)).toContain('"Guns N\' Roses 100%%.mp3"')
  })
})
