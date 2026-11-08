import './style.css'
import {
  buildCsv,
  buildText,
  buildYoutubeM3u,
  downloadFile,
  trackLabel,
  youtubeId,
  youtubePlaylistUrls,
} from './exports'
import {
  deleteSet,
  loadSets,
  newSetId,
  readImportFromHash,
  saveSet,
  type SavedSet,
} from './library'
import {
  buildOrganizerZip,
  buildSortedZip,
  matchFiles,
  planMoves,
  scoreFile,
  setFolderName,
  toAudioFiles,
  type Assignment,
  type AudioFile,
} from './organize'
import { parseTracklist } from './parse'
import {
  formatDirectLinks,
  hasAnyLink,
  resolveAll,
  type TrackLinks,
} from './search'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app')

app.innerHTML = `
  <div class="bg-glow" aria-hidden="true"></div>
  <main class="shell">
    <header class="hero">
      <p class="brand">Tracklister</p>
      <h1>Tracklist in. Playlist and sorted folder out.</h1>
      <p class="lede">
        Paste a set’s tracklist (or send it from SoundCloud with the Firefox add-on), get direct YouTube links,
        export the playlist anywhere, then sort your downloads into a folder for rekordbox.
      </p>
    </header>

    <section class="panel" aria-label="Tracklist input">
      <p class="step"><span>1</span> Tracklist</p>
      <label class="field-label" for="set-name">Set / playlist name</label>
      <input id="set-name" class="text-input" type="text" placeholder="e.g. Peggy Gou @ Boiler Room 2026" autocomplete="off" />
      <label class="field-label spaced" for="tracklist">Tracks</label>
      <textarea
        id="tracklist"
        spellcheck="false"
        placeholder="Artist - Song title&#10;00:00 Artist - Song title&#10;Artist: Song title"
      ></textarea>
      <div class="actions">
        <button type="button" class="btn primary" id="find-btn">Find links</button>
        <button type="button" class="btn ghost" id="clear-btn">Clear</button>
      </div>
      <p class="hint" id="status" role="status"></p>
    </section>

    <section class="results-section" id="results-section" hidden>
      <div class="results-header">
        <h2 class="step"><span>2</span> Links</h2>
        <div class="actions compact">
          <button type="button" class="btn primary" id="copy-all">Copy YouTube links</button>
        </div>
      </div>
      <p class="hint small">Paste the copied links into MediaHuman YouTube to MP3. Wrong match? Use <b>Fix</b> to paste the right video.</p>
      <ol class="results" id="results"></ol>
    </section>

    <section class="panel section-gap" id="export-section" hidden>
      <p class="step"><span>3</span> Make a playlist</p>
      <div class="cards">
        <button type="button" class="card" id="export-youtube">
          <strong>YouTube playlist</strong>
          <span>Opens all tracks as one YouTube playlist. Hit “Save” there to keep it.</span>
        </button>
        <button type="button" class="card" id="export-csv">
          <strong>Spotify · SoundCloud · Apple · Deezer</strong>
          <span>Downloads a CSV for Soundiiz: Import playlist → From file, then pick the platform.</span>
        </button>
        <button type="button" class="card" id="export-m3u">
          <strong>Playlist file (.m3u8)</strong>
          <span>Every entry is its YouTube link, so it plays in VLC and keeps the links with the set.</span>
        </button>
        <button type="button" class="card" id="export-txt">
          <strong>Text list</strong>
          <span>Numbered tracklist with YouTube and Spotify links underneath.</span>
        </button>
      </div>
      <p class="hint" id="export-status" role="status"></p>
      <p class="hint small flush">
        <a href="https://soundiiz.com/" target="_blank" rel="noopener noreferrer">Open Soundiiz</a>
        to send the CSV to Spotify, SoundCloud, Apple Music, Deezer, Tidal or YouTube Music.
      </p>
    </section>

    <section class="panel section-gap" id="organize-section" hidden>
      <p class="step"><span>4</span> Sort downloads into a set folder</p>
      <p class="hint small flush">
        After MediaHuman finishes, pick the folder it downloads into. Tracklister matches files to this set
        (nothing is uploaded) and builds a <b id="folder-preview">set</b> folder with numbered files and an
        .m3u8 playlist, so you can drag the folder into rekordbox.
      </p>
      <div class="actions">
        <label class="btn primary file-btn">
          Choose downloads folder
          <input type="file" id="pick-folder" webkitdirectory multiple hidden />
        </label>
        <label class="btn ghost file-btn">
          Or pick files
          <input type="file" id="pick-files" multiple accept="audio/*,.mp3,.m4a,.wav,.aiff,.aif,.flac" hidden />
        </label>
        <label class="check">
          <input type="checkbox" id="numbered" checked />
          Number files in set order
        </label>
      </div>
      <div id="match-area" hidden>
        <p class="hint" id="match-status"></p>
        <ol class="matches" id="matches"></ol>
        <div class="actions">
          <button type="button" class="btn primary" id="download-organizer">Download organizer (moves files)</button>
          <button type="button" class="btn ghost" id="download-sorted">Download sorted ZIP (copies files)</button>
        </div>
        <p class="hint small">
          <b>Organizer:</b> unzip it into the downloads folder you picked, then run <code>organize-windows.bat</code> (double-click)
          or on Mac open Terminal there and run <code>bash organize-mac.command</code>.
          <b>Sorted ZIP:</b> contains the renamed copies; unzip anywhere.
        </p>
      </div>
    </section>

    <section class="library section-gap" id="library-section" hidden>
      <h2 class="step"><span>★</span> Saved sets</h2>
      <ul class="library-list" id="library"></ul>
    </section>
  </main>
`

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!

const setNameEl = $<HTMLInputElement>('#set-name')
const tracklistEl = $<HTMLTextAreaElement>('#tracklist')
const findBtn = $<HTMLButtonElement>('#find-btn')
const clearBtn = $<HTMLButtonElement>('#clear-btn')
const statusEl = $<HTMLParagraphElement>('#status')
const resultsSection = $<HTMLElement>('#results-section')
const resultsEl = $<HTMLOListElement>('#results')
const copyAllBtn = $<HTMLButtonElement>('#copy-all')
const exportSection = $<HTMLElement>('#export-section')
const exportStatusEl = $<HTMLParagraphElement>('#export-status')
const organizeSection = $<HTMLElement>('#organize-section')
const folderPreviewEl = $<HTMLElement>('#folder-preview')
const pickFolderEl = $<HTMLInputElement>('#pick-folder')
const pickFilesEl = $<HTMLInputElement>('#pick-files')
const numberedEl = $<HTMLInputElement>('#numbered')
const matchArea = $<HTMLElement>('#match-area')
const matchStatusEl = $<HTMLParagraphElement>('#match-status')
const matchesEl = $<HTMLOListElement>('#matches')
const librarySection = $<HTMLElement>('#library-section')
const libraryEl = $<HTMLUListElement>('#library')

let current: SavedSet | null = null
let audioFiles: AudioFile[] = []
let assignments: Assignment[] = []
let runId = 0

function setStatus(message: string) {
  statusEl.textContent = message
}

function setExportStatus(message: string) {
  exportStatusEl.textContent = message
}

function youtubeIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.8 15.5v-7l6.3 3.5-6.3 3.5z"/></svg>`
}

function spotifyIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.5 17.3a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 1 1-.33-1.46c4.55-1.03 8.45-.59 11.66 1.38a.75.75 0 0 1 .25 1zM19 14a.75.75 0 0 1-1.03.28c-3.23-1.98-8.15-2.56-11.96-1.4A.75.75 0 1 1 5.7 11.5c4.3-1.3 9.64-.67 13.3 1.58A.75.75 0 0 1 19 14zm.1-2.8c-3.87-2.3-10.26-2.51-13.95-1.39a.75.75 0 1 1-.43-1.44c4.2-1.26 11.12-1.02 15.52 1.6a.75.75 0 1 1-.74 1.23z"/></svg>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function tracks(): TrackLinks[] {
  return current?.tracks ?? []
}

function renderResultItem(result: TrackLinks, index: number): HTMLLIElement {
  const li = document.createElement('li')
  li.className = 'result'
  if (!hasAnyLink(result)) li.classList.add('missing')

  const art = result.artwork
    ? `<img class="art" src="${escapeHtml(result.artwork)}" alt="" width="48" height="48" loading="lazy" />`
    : `<div class="art placeholder" aria-hidden="true">${index + 1}</div>`

  const chips: string[] = []

  if (result.youtube) {
    chips.push(`<a class="chip youtube" href="${escapeHtml(result.youtube)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(result.youtubeTitle ?? '')}">
      ${youtubeIcon()} YouTube
    </a>`)
  } else {
    const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(trackLabel(result))}`
    chips.push(`<a class="chip" href="${search}" target="_blank" rel="noopener noreferrer">Search YouTube</a>`)
  }

  if (result.spotify) {
    chips.push(`<a class="chip spotify" href="${escapeHtml(result.spotify)}" target="_blank" rel="noopener noreferrer">
      ${spotifyIcon()} Spotify
    </a>`)
  }

  if (result.youtube) {
    chips.push(`<button type="button" class="chip copy-one" data-index="${index}" title="Copy this track’s YouTube link">Copy</button>`)
  }
  chips.push(`<button type="button" class="chip fix-one" data-index="${index}" title="Paste a different YouTube link">Fix</button>`)

  const note = result.youtubeTitle
    ? `<p class="note">${escapeHtml(result.youtubeTitle)}</p>`
    : `<p class="note">Not found on YouTube</p>`

  li.innerHTML = `
    ${art}
    <div class="meta">
      <p class="title">${escapeHtml(result.displayTitle)}</p>
      <p class="artist">${escapeHtml(result.displayArtist)}</p>
      ${note}
    </div>
    <div class="links">
      ${chips.join('')}
    </div>
  `
  return li
}

function renderResults() {
  resultsEl.innerHTML = ''
  tracks().forEach((track, index) => resultsEl.appendChild(renderResultItem(track, index)))
  const hasTracks = tracks().length > 0
  resultsSection.hidden = !hasTracks
  exportSection.hidden = !hasTracks
  organizeSection.hidden = !hasTracks
  folderPreviewEl.textContent = current ? setFolderName(current) : 'set'
}

function renderLibrary() {
  const sets = loadSets()
  librarySection.hidden = sets.length === 0
  libraryEl.innerHTML = sets
    .map((set) => {
      const found = set.tracks.filter((track) => track.youtube).length
      const date = new Date(set.updatedAt).toLocaleDateString()
      const active = current?.id === set.id ? ' active' : ''
      return `<li class="library-item${active}">
        <div class="meta">
          <p class="title">${escapeHtml(set.name)}</p>
          <p class="artist">${set.tracks.length} tracks · ${found} on YouTube · ${date}</p>
        </div>
        <div class="links">
          <button type="button" class="chip" data-open="${set.id}">Open</button>
          <button type="button" class="chip danger" data-delete="${set.id}">Delete</button>
        </div>
      </li>`
    })
    .join('')
}

function persistCurrent() {
  if (!current || current.tracks.length === 0) return
  saveSet(current)
  renderLibrary()
}

function resetOrganizer() {
  audioFiles = []
  assignments = []
  matchArea.hidden = true
  matchesEl.innerHTML = ''
  pickFolderEl.value = ''
  pickFilesEl.value = ''
}

function openSet(set: SavedSet) {
  runId += 1
  current = set
  setNameEl.value = set.name
  tracklistEl.value = set.source
  findBtn.disabled = false
  resetOrganizer()
  renderResults()
  renderLibrary()
  setStatus(`Opened “${set.name}”.`)
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function defaultSetName(): string {
  return `Set ${new Date().toISOString().slice(0, 10)}`
}

async function findLinks() {
  const parsed = parseTracklist(tracklistEl.value)
  if (parsed.length === 0) {
    setStatus('Paste at least one track (Artist - Title, Artist: Title, or 00:00 Artist - Title).')
    return
  }

  const name = setNameEl.value.trim() || defaultSetName()
  setNameEl.value = name
  const currentRun = ++runId
  current = {
    id: current && current.source === tracklistEl.value ? current.id : newSetId(),
    name,
    source: tracklistEl.value,
    tracks: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  resetOrganizer()
  renderResults()
  findBtn.disabled = true
  resultsSection.hidden = false
  setStatus(`Looking up 0 / ${parsed.length}…`)

  try {
    await resolveAll(parsed, (done, total, result) => {
      if (currentRun !== runId || !current) return
      current.tracks.push(result)
      resultsEl.appendChild(renderResultItem(result, done - 1))
      setStatus(`Looking up ${done} / ${total}…`)
    })

    if (currentRun !== runId || !current) return
    renderResults()
    persistCurrent()
    const found = current.tracks.filter(hasAnyLink).length
    setStatus(`Done — ${found} of ${current.tracks.length} found. Saved as “${current.name}”.`)
  } catch (error) {
    if (currentRun !== runId) return
    const message = error instanceof Error ? error.message : 'Unknown error'
    setStatus(`Lookup failed: ${message}`)
    persistCurrent()
  } finally {
    if (currentRun === runId) findBtn.disabled = false
  }
}

async function copyText(text: string, label: string) {
  if (!text.trim()) {
    setStatus('No links to copy.')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    setStatus(`Copied ${label} to clipboard.`)
  } catch {
    setStatus('Could not copy — select and copy manually.')
  }
}

function youtubeLinks(list: TrackLinks[]): string {
  return list
    .map((track) => track.youtube)
    .filter(Boolean)
    .join('\n')
}

function fixTrack(index: number) {
  const track = tracks()[index]
  if (!track || !current) return
  const input = window.prompt(`YouTube link for “${trackLabel(track)}”`, track.youtube ?? '')
  if (input === null) return
  if (input.trim() === '') {
    track.youtube = null
    track.youtubeTitle = null
  } else {
    const id = youtubeId(input)
    if (!id) {
      setStatus('That doesn’t look like a YouTube video link.')
      return
    }
    track.youtube = `https://www.youtube.com/watch?v=${id}`
    track.youtubeTitle = 'Set manually'
  }
  resultsEl.replaceChild(renderResultItem(track, index), resultsEl.children[index])
  persistCurrent()
  setStatus(`Updated “${trackLabel(track)}”.`)
}

function exportBaseName(): string {
  return current ? setFolderName(current) : 'tracklist'
}

function currentSetData() {
  return { name: current?.name ?? defaultSetName(), tracks: tracks() }
}

// ---- organize ----

function candidateOptions(track: TrackLinks, selected: AudioFile | null): AudioFile[] {
  const ranked = audioFiles
    .map((file) => ({ file, score: scoreFile(track, file.name) }))
    .filter((entry) => entry.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => entry.file)
  if (selected && !ranked.includes(selected)) ranked.unshift(selected)
  return ranked
}

function renderMatches() {
  const list = tracks()
  const matched = assignments.filter((assignment) => assignment.file).length
  matchStatusEl.textContent = `Matched ${matched} of ${list.length} tracks from ${audioFiles.length} audio files. Fix any row with the dropdown.`
  matchesEl.innerHTML = ''
  list.forEach((track, index) => {
    const selected = assignments[index]?.file ?? null
    const options = candidateOptions(track, selected)
    const li = document.createElement('li')
    li.className = `match${selected ? '' : ' missing'}`
    li.innerHTML = `
      <div class="meta">
        <p class="title">${index + 1}. ${escapeHtml(trackLabel(track))}</p>
      </div>
      <select data-index="${index}" aria-label="File for ${escapeHtml(trackLabel(track))}">
        <option value="">— not downloaded / skip —</option>
        ${options
          .map((file) => {
            const fileIndex = audioFiles.indexOf(file)
            return `<option value="${fileIndex}"${file === selected ? ' selected' : ''}>${escapeHtml(file.path)}</option>`
          })
          .join('')}
      </select>
    `
    matchesEl.appendChild(li)
  })
  matchArea.hidden = false
}

function handlePickedFiles(fileList: FileList | null) {
  if (!fileList || fileList.length === 0) return
  audioFiles = toAudioFiles(Array.from(fileList))
  if (audioFiles.length === 0) {
    matchArea.hidden = false
    matchesEl.innerHTML = ''
    matchStatusEl.textContent = 'No audio files (mp3, m4a, wav, aiff, flac…) in that selection.'
    return
  }
  assignments = matchFiles(tracks(), audioFiles)
  renderMatches()
}

function plannedMoves() {
  return planMoves(currentSetData(), assignments, { numbered: numberedEl.checked })
}

async function downloadOrganizer() {
  if (!current) return
  const moves = plannedMoves()
  if (moves.length === 0) {
    matchStatusEl.textContent = 'No tracks matched yet — pick files for at least one track.'
    return
  }
  const zip = await buildOrganizerZip(currentSetData(), moves, buildText(currentSetData()))
  downloadFile(`${exportBaseName()} - organizer.zip`, zip, 'application/zip')
  matchStatusEl.textContent = `Organizer for ${moves.length} tracks downloaded.`
}

async function downloadSorted(button: HTMLButtonElement) {
  if (!current) return
  const moves = plannedMoves()
  if (moves.length === 0) {
    matchStatusEl.textContent = 'No tracks matched yet — pick files for at least one track.'
    return
  }
  button.disabled = true
  matchStatusEl.textContent = `Zipping ${moves.length} files…`
  try {
    const zip = await buildSortedZip(currentSetData(), moves, buildText(currentSetData()))
    downloadFile(`${exportBaseName()}.zip`, zip, 'application/zip')
    matchStatusEl.textContent = `Sorted ZIP with ${moves.length} tracks downloaded.`
  } catch (error) {
    matchStatusEl.textContent = `Could not build ZIP: ${error instanceof Error ? error.message : error}`
  } finally {
    button.disabled = false
  }
}

// ---- events ----

findBtn.addEventListener('click', () => {
  void findLinks()
})

clearBtn.addEventListener('click', () => {
  runId += 1
  current = null
  tracklistEl.value = ''
  setNameEl.value = ''
  resetOrganizer()
  renderResults()
  renderLibrary()
  findBtn.disabled = false
  setStatus('')
  tracklistEl.focus()
})

setNameEl.addEventListener('change', () => {
  if (!current) return
  current.name = setNameEl.value.trim() || current.name
  setNameEl.value = current.name
  folderPreviewEl.textContent = setFolderName(current)
  persistCurrent()
})

copyAllBtn.addEventListener('click', () => {
  const text = youtubeLinks(tracks())
  const count = text ? text.split('\n').length : 0
  void copyText(text, `${count} YouTube links`)
})

resultsEl.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const copy = target.closest<HTMLButtonElement>('button.copy-one')
  if (copy) {
    const result = tracks()[Number(copy.dataset.index)]
    if (result) void copyText(formatDirectLinks([{ ...result, spotify: null }]), 'link')
    return
  }
  const fix = target.closest<HTMLButtonElement>('button.fix-one')
  if (fix) fixTrack(Number(fix.dataset.index))
})

$<HTMLButtonElement>('#export-youtube').addEventListener('click', () => {
  const urls = youtubePlaylistUrls(tracks())
  if (urls.length === 0) {
    setExportStatus('No YouTube links to build a playlist from.')
    return
  }
  urls.forEach((url) => window.open(url, '_blank', 'noopener'))
  setExportStatus(
    urls.length > 1
      ? `Opened ${urls.length} YouTube playlists (YouTube allows 50 tracks each). Allow pop-ups if only one opened.`
      : 'Opened the YouTube playlist in a new tab.',
  )
})

$<HTMLButtonElement>('#export-csv').addEventListener('click', () => {
  downloadFile(`${exportBaseName()}.csv`, buildCsv(currentSetData()), 'text/csv;charset=utf-8')
  setExportStatus('CSV downloaded. On Soundiiz: Import playlist → From file → choose this CSV → pick Spotify, SoundCloud, etc.')
})

$<HTMLButtonElement>('#export-m3u').addEventListener('click', () => {
  downloadFile(`${exportBaseName()}.m3u8`, buildYoutubeM3u(currentSetData()), 'audio/x-mpegurl;charset=utf-8')
  setExportStatus('Playlist file downloaded.')
})

$<HTMLButtonElement>('#export-txt').addEventListener('click', () => {
  downloadFile(`${exportBaseName()} - links.txt`, buildText(currentSetData()), 'text/plain;charset=utf-8')
  setExportStatus('Text list downloaded.')
})

pickFolderEl.addEventListener('change', () => handlePickedFiles(pickFolderEl.files))
pickFilesEl.addEventListener('change', () => handlePickedFiles(pickFilesEl.files))

matchesEl.addEventListener('change', (event) => {
  const select = event.target
  if (!(select instanceof HTMLSelectElement)) return
  const index = Number(select.dataset.index)
  const file = select.value === '' ? null : audioFiles[Number(select.value)]
  if (file) {
    assignments.forEach((assignment, other) => {
      if (other !== index && assignment.file === file) assignments[other] = { file: null, score: 0 }
    })
  }
  assignments[index] = { file: file ?? null, score: file ? 1 : 0 }
  renderMatches()
})

$<HTMLButtonElement>('#download-organizer').addEventListener('click', () => {
  void downloadOrganizer()
})

const sortedBtn = $<HTMLButtonElement>('#download-sorted')
sortedBtn.addEventListener('click', () => {
  void downloadSorted(sortedBtn)
})

libraryEl.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const open = target.closest<HTMLButtonElement>('[data-open]')
  if (open) {
    const set = loadSets().find((entry) => entry.id === open.dataset.open)
    if (set) openSet(set)
    return
  }
  const remove = target.closest<HTMLButtonElement>('[data-delete]')
  if (remove) {
    const set = loadSets().find((entry) => entry.id === remove.dataset.delete)
    if (!set || !window.confirm(`Delete “${set.name}”?`)) return
    deleteSet(set.id)
    if (current?.id === set.id) {
      current = null
      resetOrganizer()
      renderResults()
    }
    renderLibrary()
  }
})

tracklistEl.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    void findLinks()
  }
})

function handleImport() {
  const payload = readImportFromHash(window.location.hash)
  if (!payload) return
  history.replaceState(null, '', window.location.pathname + window.location.search)
  current = null
  setNameEl.value = payload.name?.trim() ?? ''
  tracklistEl.value = payload.text
  resetOrganizer()
  renderResults()
  if (!payload.text.trim()) {
    setStatus('Select the tracklist text on the page before sending it, or paste it here.')
    tracklistEl.focus()
    return
  }
  if (parseTracklist(payload.text).length === 0) {
    setStatus('Got text from the add-on, but no tracks were recognised. Edit it into Artist - Title lines and press Find links.')
    return
  }
  void findLinks()
}

window.addEventListener('hashchange', handleImport)
renderLibrary()
handleImport()
