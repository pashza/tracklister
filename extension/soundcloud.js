/* global browser */

const API = 'https://api-v2.soundcloud.com'

// First path segments that are SoundCloud app pages, not artists.
const RESERVED = new Set([
  'discover', 'stream', 'search', 'you', 'settings', 'upload', 'charts', 'messages',
  'notifications', 'pages', 'terms-of-use', 'imprint', 'feed', 'people', 'pro', 'jobs',
  'mobile', 'connect', 'signin', 'logout', 'artists', 'creators', 'premium', 'go', 'popular',
])
// Second segments on an artist's profile that list many sounds rather than one set.
const PROFILE_TABS = new Set([
  'tracks', 'albums', 'sets', 'reposts', 'likes', 'followers', 'following', 'popular-tracks',
  'comments', 'spotlight',
])

const TRACK_LINE_RE = /\S\s*[-–—~:]\s+\S/

function isSoundPage(pathname = location.pathname) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length < 2 || RESERVED.has(parts[0])) return false
  if (parts.length === 2) return !PROFILE_TABS.has(parts[1])
  return parts[1] === 'sets' && parts.length >= 3
}

function toast(message) {
  let el = document.getElementById('tracklister-toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'tracklister-toast'
    document.body.appendChild(el)
  }
  el.textContent = message
  el.classList.add('visible')
  clearTimeout(el._timer)
  el._timer = setTimeout(() => el.classList.remove('visible'), 4000)
}

function htmlToText(value) {
  if (!value) return ''
  const withBreaks = String(value).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html')
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ')
}

function trackLineCount(text) {
  return text.split(/\r?\n/).filter((line) => TRACK_LINE_RE.test(line)).length
}

async function readHydration() {
  const response = await fetch(location.href, { credentials: 'include' })
  const html = await response.text()
  const match = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/)
  if (!match) throw new Error('SoundCloud page data not found')
  const entries = JSON.parse(match[1])
  const get = (name) => entries.find((entry) => entry.hydratable === name)?.data
  return { sound: get('sound'), playlist: get('playlist'), clientId: get('apiClient')?.id }
}

async function api(path, clientId) {
  const url = new URL(path, API)
  url.searchParams.set('client_id', clientId)
  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`SoundCloud API ${response.status}`)
  return response.json()
}

/** Tracklists are often posted as one long comment when the description has none. */
async function tracklistFromComments(trackId, clientId) {
  let best = ''
  let path = `/tracks/${trackId}/comments?threaded=0&filter_replies=0&limit=200`
  for (let page = 0; page < 3 && path; page++) {
    const data = await api(path, clientId)
    for (const comment of data.collection ?? []) {
      const body = comment.body ?? ''
      if (trackLineCount(body) > trackLineCount(best)) best = body
    }
    path = data.next_href ? data.next_href.replace(API, '') : null
  }
  return trackLineCount(best) >= 3 ? best : ''
}

function playlistLine(track) {
  const title = (track.title ?? '').trim()
  const artist = (track.publisher_metadata?.artist || track.user?.username || '').trim()
  if (!title) return null
  if (/\s[-–—]\s/.test(title) || !artist) return title
  return `${artist} - ${title}`
}

async function playlistText(playlist, clientId) {
  const tracks = playlist.tracks ?? []
  const missing = tracks.filter((track) => !track.title).map((track) => track.id)
  const filled = new Map()
  for (let i = 0; i < missing.length && clientId; i += 50) {
    const ids = missing.slice(i, i + 50).join(',')
    const data = await api(`/tracks?ids=${ids}`, clientId)
    for (const track of data) filled.set(track.id, track)
  }
  return tracks
    .map((track) => playlistLine(track.title ? track : (filled.get(track.id) ?? track)))
    .filter(Boolean)
    .join('\n')
}

async function collect() {
  const selection = String(window.getSelection() || '').trim()
  if (selection && selection.split('\n').length >= 2) {
    return { name: document.title.replace(/^Stream\s+/i, '').split(' | ')[0], text: selection, source: location.href }
  }

  const { sound, playlist, clientId } = await readHydration()

  if (playlist) {
    return {
      name: playlist.title,
      text: await playlistText(playlist, clientId),
      source: playlist.permalink_url ?? location.href,
    }
  }

  if (sound) {
    let text = htmlToText(sound.description)
    if (trackLineCount(text) < 3 && clientId) {
      const fromComments = await tracklistFromComments(sound.id, clientId).catch(() => '')
      if (fromComments) text = fromComments
    }
    const name = (sound.title ?? '')
      .replace(/\s*[-–|(\[]*\s*(?:with\s+|w\/\s*|\+\s*)?track\s*list(?:\s+(?:added|included|in description))?[)\]]?\s*$/i, '')
      .trim()
    return { name: name || sound.user?.username || '', text, source: sound.permalink_url ?? location.href }
  }

  throw new Error('Open a set or playlist page first')
}

async function send() {
  const button = document.getElementById('tracklister-button')
  try {
    if (button) button.disabled = true
    toast('Reading tracklist…')
    const payload = await collect()
    if (!payload.text.trim()) {
      toast('No tracklist found in the description or comments. Select the tracklist text and try again.')
      return
    }
    await browser.runtime.sendMessage({ type: 'tracklister:open', payload })
    toast('Opened in Tracklister')
  } catch (error) {
    toast(`Tracklister: ${error instanceof Error ? error.message : error}`)
  } finally {
    if (button) button.disabled = false
  }
}

function ensureButton() {
  let button = document.getElementById('tracklister-button')
  if (!button) {
    button = document.createElement('button')
    button.id = 'tracklister-button'
    button.type = 'button'
    button.title = 'Send this set’s tracklist to Tracklister'
    button.innerHTML = '<span aria-hidden="true">▶</span> Tracklister'
    button.addEventListener('click', () => void send())
    document.body.appendChild(button)
  }
  button.hidden = !isSoundPage()
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === 'tracklister:collect') {
    void send()
    return Promise.resolve(true)
  }
  return undefined
})

// SoundCloud is a single-page app, so watch for client-side navigation.
let lastPath = ''
setInterval(() => {
  if (location.pathname === lastPath && document.getElementById('tracklister-button')) return
  lastPath = location.pathname
  ensureButton()
}, 1000)
ensureButton()
