import { downloadZip } from 'client-zip'
import { sanitizeFileName, trackFileStem, trackLabel, type SetData } from './exports'
import type { TrackLinks } from './search'

export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'aiff', 'aif', 'flac', 'ogg', 'opus', 'alac']

const MATCH_THRESHOLD = 0.55

export type AudioFile = {
  /** Path relative to the folder the user picked (where the organizer script will run). */
  path: string
  name: string
  file: File
}

export type Assignment = {
  file: AudioFile | null
  score: number
}

const NOISE_WORDS = new Set([
  'official', 'video', 'audio', 'music', 'lyric', 'lyrics', 'hd', 'hq', '4k', 'visualizer',
  'visualiser', 'premiere', 'free', 'download', 'full', 'track', 'original', 'the', 'a', 'and',
  'feat', 'ft', 'featuring', 'x', 'vs', 'mp3', 'out', 'now',
])

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter((token) => token && !NOISE_WORDS.has(token))
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

function stem(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}

export function isAudioFile(name: string): boolean {
  return AUDIO_EXTENSIONS.includes(extension(name))
}

/** Webkitdirectory paths start with the picked folder's own name; scripts run inside it. */
export function toAudioFiles(files: Iterable<File>): AudioFile[] {
  const result: AudioFile[] = []
  for (const file of files) {
    if (!isAudioFile(file.name)) continue
    const relative = file.webkitRelativePath
      ? file.webkitRelativePath.split('/').slice(1).join('/')
      : file.name
    result.push({ path: relative || file.name, name: file.name, file })
  }
  return result
}

function overlap(wanted: string[], candidate: Set<string>): number {
  if (wanted.length === 0) return 0
  return wanted.filter((token) => candidate.has(token)).length / wanted.length
}

/** 0..1 — how likely `fileName` is the download of `track`. */
export function scoreFile(track: TrackLinks, fileName: string): number {
  const fileTokens = tokens(stem(fileName))
  if (fileTokens.length === 0) return 0
  const fileSet = new Set(fileTokens)
  const fileNorm = fileTokens.join(' ')

  let best = 0
  const candidates = [trackLabel(track), track.youtubeTitle ?? '']
  for (const candidate of candidates) {
    const wanted = tokens(candidate)
    if (wanted.length === 0) continue
    if (wanted.join(' ') === fileNorm) return 1
    const recall = overlap(wanted, fileSet)
    const precision = overlap(fileTokens, new Set(wanted))
    best = Math.max(best, recall * 0.7 + precision * 0.3)
  }

  // The title alone must be present; artist-only overlaps are common across a set.
  const titleTokens = tokens(track.displayTitle.replace(/\([^)]*\)|\[[^\]]*\]/g, ''))
  if (titleTokens.length > 0 && overlap(titleTokens, fileSet) < 0.5) best *= 0.5

  return best
}

/** Greedy best-first assignment so each file is used at most once. */
export function matchFiles(tracks: TrackLinks[], files: AudioFile[]): Assignment[] {
  const pairs: Array<{ track: number; file: number; score: number }> = []
  tracks.forEach((track, t) => {
    files.forEach((file, f) => {
      const score = scoreFile(track, file.name)
      if (score >= MATCH_THRESHOLD) pairs.push({ track: t, file: f, score })
    })
  })
  pairs.sort((a, b) => b.score - a.score)

  const assignments: Assignment[] = tracks.map(() => ({ file: null, score: 0 }))
  const usedFiles = new Set<number>()
  for (const pair of pairs) {
    if (assignments[pair.track].file || usedFiles.has(pair.file)) continue
    assignments[pair.track] = { file: files[pair.file], score: pair.score }
    usedFiles.add(pair.file)
  }
  return assignments
}

export type OrganizeOptions = {
  numbered: boolean
}

export type PlannedMove = {
  track: TrackLinks
  source: AudioFile
  target: string
}

export function planMoves(set: SetData, assignments: Assignment[], options: OrganizeOptions): PlannedMove[] {
  const moves: PlannedMove[] = []
  const used = new Set<string>()
  set.tracks.forEach((track, index) => {
    const source = assignments[index]?.file
    if (!source) return
    let target = `${trackFileStem(track, index, set.tracks.length, options.numbered)}.${extension(source.name)}`
    let n = 2
    while (used.has(target.toLowerCase())) {
      target = `${trackFileStem(track, index, set.tracks.length, options.numbered)} (${n++}).${extension(source.name)}`
    }
    used.add(target.toLowerCase())
    moves.push({ track, source, target })
  })
  return moves
}

export function setFolderName(set: SetData): string {
  return sanitizeFileName(set.name || 'Tracklister set', 80)
}

/** Rekordbox-friendly playlist: relative paths next to the audio, YouTube links kept as comments. */
export function buildLocalM3u(set: SetData, moves: PlannedMove[]): string {
  const byTrack = new Map(moves.map((move) => [move.track, move]))
  const lines = ['#EXTM3U', `#PLAYLIST:${set.name}`]
  for (const track of set.tracks) {
    const move = byTrack.get(track)
    if (track.youtube) lines.push(`# YouTube: ${track.youtube}`)
    if (!move) {
      lines.push(`# Missing: ${trackLabel(track)}`)
      continue
    }
    lines.push(`#EXTINF:-1,${trackLabel(track)}`)
    lines.push(move.target)
  }
  return lines.join('\n') + '\n'
}

function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function batQuote(value: string): string {
  return `"${value.replaceAll('%', '%%').replaceAll('/', '\\')}"`
}

export function buildMacScript(set: SetData, moves: PlannedMove[]): string {
  const folder = setFolderName(set)
  const lines = [
    '#!/bin/bash',
    `# Tracklister organizer for "${folder.replaceAll('"', '')}"`,
    '# Run it from the folder your downloads are in: bash organize-mac.command',
    'cd "$(dirname "$0")" || exit 1',
    `mkdir -p ${shQuote(folder)}`,
  ]
  for (const move of moves) {
    const target = `${folder}/${move.target}`
    lines.push(`[ -e ${shQuote(move.source.path)} ] && mv -n ${shQuote(move.source.path)} ${shQuote(target)}`)
  }
  lines.push(
    `[ -e ${shQuote(`${folder}.m3u8`)} ] && mv -f ${shQuote(`${folder}.m3u8`)} ${shQuote(`${folder}/${folder}.m3u8`)}`,
    `[ -e ${shQuote(`${folder} - links.txt`)} ] && mv -f ${shQuote(`${folder} - links.txt`)} ${shQuote(`${folder}/${folder} - links.txt`)}`,
    `echo "Moved ${moves.length} tracks into: ${folder.replaceAll('"', '')}"`,
  )
  return lines.join('\n') + '\n'
}

export function buildWindowsScript(set: SetData, moves: PlannedMove[]): string {
  const folder = setFolderName(set)
  const lines = [
    '@echo off',
    'chcp 65001 >nul',
    'cd /d "%~dp0"',
    `if not exist ${batQuote(folder)} mkdir ${batQuote(folder)}`,
  ]
  for (const move of moves) {
    const target = `${folder}\\${move.target}`
    lines.push(`if exist ${batQuote(move.source.path)} if not exist ${batQuote(target)} move ${batQuote(move.source.path)} ${batQuote(target)} >nul`)
  }
  lines.push(
    `if exist ${batQuote(`${folder}.m3u8`)} move /y ${batQuote(`${folder}.m3u8`)} ${batQuote(`${folder}\\${folder}.m3u8`)} >nul`,
    `if exist ${batQuote(`${folder} - links.txt`)} move /y ${batQuote(`${folder} - links.txt`)} ${batQuote(`${folder}\\${folder} - links.txt`)} >nul`,
    `echo Moved ${moves.length} tracks into: ${folder.replace(/[&|<>^%]/g, '')}`,
    'pause',
  )
  return lines.join('\r\n') + '\r\n'
}

/** Small zip: two organizer scripts + playlist + links; unzip it into the downloads folder. */
export async function buildOrganizerZip(set: SetData, moves: PlannedMove[], linksText: string): Promise<Blob> {
  const folder = setFolderName(set)
  return downloadZip([
    { name: 'organize-windows.bat', input: buildWindowsScript(set, moves) },
    { name: 'organize-mac.command', input: buildMacScript(set, moves) },
    { name: `${folder}.m3u8`, input: buildLocalM3u(set, moves) },
    { name: `${folder} - links.txt`, input: linksText },
  ]).blob()
}

/** Full copy: the set folder with renamed audio, playlist and links, ready to drop into rekordbox. */
export async function buildSortedZip(set: SetData, moves: PlannedMove[], linksText: string): Promise<Blob> {
  const folder = setFolderName(set)
  return downloadZip([
    ...moves.map((move) => ({
      name: `${folder}/${move.target}`,
      input: move.source.file,
      lastModified: move.source.file.lastModified,
    })),
    { name: `${folder}/${folder}.m3u8`, input: buildLocalM3u(set, moves) },
    { name: `${folder}/${folder} - links.txt`, input: linksText },
  ]).blob()
}
