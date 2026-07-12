import './style.css'
import { parseTracklist } from './parse'
import {
  formatClipboardLinks,
  formatMarkdownLinks,
  formatYoutubeLinks,
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
      <h1>Paste a tracklist. Get the links.</h1>
      <p class="lede">
        Runs entirely in your browser — paste a tracklist, get YouTube and Spotify links you can open or copy.
      </p>
    </header>

    <section class="panel" aria-label="Tracklist input">
      <label class="field-label" for="tracklist">Tracklist</label>
      <textarea
        id="tracklist"
        spellcheck="false"
        placeholder="Artist: Song title&#10;Artist - Song title"
      ></textarea>
      <div class="actions">
        <button type="button" class="btn primary" id="find-btn">Find links</button>
        <button type="button" class="btn ghost" id="clear-btn">Clear</button>
      </div>
      <p class="hint" id="status" role="status"></p>
    </section>

    <section class="results-section" id="results-section" hidden>
      <div class="results-header">
        <h2>Links</h2>
        <div class="actions compact">
          <button type="button" class="btn primary" id="copy-all">Copy all links</button>
          <button type="button" class="btn ghost" id="copy-youtube">Copy YouTube</button>
          <button type="button" class="btn ghost" id="copy-md">Copy markdown</button>
        </div>
      </div>
      <ol class="results" id="results"></ol>
    </section>
  </main>
`

const tracklistEl = document.querySelector<HTMLTextAreaElement>('#tracklist')!
const findBtn = document.querySelector<HTMLButtonElement>('#find-btn')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const resultsSection = document.querySelector<HTMLElement>('#results-section')!
const resultsEl = document.querySelector<HTMLOListElement>('#results')!
const copyAllBtn = document.querySelector<HTMLButtonElement>('#copy-all')!
const copyYoutubeBtn = document.querySelector<HTMLButtonElement>('#copy-youtube')!
const copyMdBtn = document.querySelector<HTMLButtonElement>('#copy-md')!

let latestResults: TrackLinks[] = []
let runId = 0

function setStatus(message: string) {
  statusEl.textContent = message
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

function renderResultItem(result: TrackLinks, index: number): HTMLLIElement {
  const li = document.createElement('li')
  li.className = 'result'

  const art = result.artwork
    ? `<img class="art" src="${result.artwork}" alt="" width="48" height="48" loading="lazy" />`
    : `<div class="art placeholder" aria-hidden="true">${index + 1}</div>`

  li.innerHTML = `
    ${art}
    <div class="meta">
      <p class="title">${escapeHtml(result.displayTitle)}</p>
      <p class="artist">${escapeHtml(result.displayArtist)}</p>
    </div>
    <div class="links">
      <a class="chip youtube" href="${result.youtube}" target="_blank" rel="noopener noreferrer">
        ${youtubeIcon()} YouTube
      </a>
      <a class="chip spotify" href="${result.spotify}" target="_blank" rel="noopener noreferrer">
        ${spotifyIcon()} Spotify
      </a>
      <button type="button" class="chip copy-one" data-index="${index}" title="Copy this track’s links">
        Copy
      </button>
    </div>
  `
  return li
}

function resetResults() {
  resultsEl.innerHTML = ''
  resultsSection.hidden = true
  latestResults = []
}

async function findLinks() {
  const tracks = parseTracklist(tracklistEl.value)
  if (tracks.length === 0) {
    setStatus('Paste at least one track (Artist: Title or Artist - Title).')
    resetResults()
    return
  }

  const currentRun = ++runId
  findBtn.disabled = true
  resultsSection.hidden = false
  resultsEl.innerHTML = ''
  latestResults = []
  setStatus(`Looking up 0 / ${tracks.length}…`)

  try {
    await resolveAll(tracks, (done, total, result) => {
      if (currentRun !== runId) return
      latestResults.push(result)
      resultsEl.appendChild(renderResultItem(result, done - 1))
      setStatus(`Looking up ${done} / ${total}…`)
    })

    if (currentRun !== runId) return
    setStatus(`Done — ${latestResults.length} tracks ready.`)
  } catch {
    if (currentRun !== runId) return
    setStatus('Something went wrong while looking up tracks. Try again.')
  } finally {
    if (currentRun === runId) findBtn.disabled = false
  }
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    setStatus(`Copied ${label} to clipboard.`)
  } catch {
    setStatus('Could not copy — select and copy manually.')
  }
}

findBtn.addEventListener('click', () => {
  void findLinks()
})

clearBtn.addEventListener('click', () => {
  runId += 1
  tracklistEl.value = ''
  resetResults()
  findBtn.disabled = false
  setStatus('')
  tracklistEl.focus()
})

copyAllBtn.addEventListener('click', () => {
  if (latestResults.length === 0) return
  void copyText(formatClipboardLinks(latestResults), `${latestResults.length} track links`)
})

copyYoutubeBtn.addEventListener('click', () => {
  if (latestResults.length === 0) return
  void copyText(formatYoutubeLinks(latestResults), 'YouTube links')
})

copyMdBtn.addEventListener('click', () => {
  if (latestResults.length === 0) return
  void copyText(formatMarkdownLinks(latestResults), 'markdown')
})

resultsEl.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const button = target.closest<HTMLButtonElement>('button.copy-one')
  if (!button) return
  const index = Number(button.dataset.index)
  const result = latestResults[index]
  if (!result) return
  void copyText(
    `${result.displayArtist} – ${result.displayTitle}\n${result.youtube}\n${result.spotify}`,
    'track links',
  )
})

tracklistEl.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    void findLinks()
  }
})
