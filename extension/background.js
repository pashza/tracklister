/* global browser */

// Point this at http://localhost:5173 while developing the web app.
const TRACKLISTER_URL = 'https://tracklister-sage.vercel.app/'

const MENU_ID = 'tracklister-send-selection'

function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function openTracklister(payload, openerTab) {
  const url = `${TRACKLISTER_URL}#import=${encodePayload(payload)}`
  return browser.tabs.create({
    url,
    index: openerTab ? openerTab.index + 1 : undefined,
    openerTabId: openerTab?.id,
  })
}

/** Selection with line breaks intact (contextMenus' selectionText flattens them). */
async function readSelection(tabId) {
  const [result] = await browser.scripting.executeScript({
    target: { tabId },
    func: () => ({
      text: String(window.getSelection() || ''),
      title: document.title,
      url: location.href,
    }),
  })
  return result?.result ?? null
}

function cleanTitle(title) {
  return (title || '')
    .replace(/\s*\|\s*Listen online.*$/i, '')
    .replace(/\s*[-|]\s*(YouTube|SoundCloud|Mixcloud)\s*$/i, '')
    .replace(/^Stream\s+/i, '')
    .trim()
}

async function sendSelection(tab) {
  const selection = await readSelection(tab.id)
  if (!selection || !selection.text.trim()) return false
  await openTracklister(
    { name: cleanTitle(selection.title), text: selection.text, source: selection.url },
    tab,
  )
  return true
}

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: MENU_ID,
    title: 'Send tracklist to Tracklister',
    contexts: ['selection'],
  })
})

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab) void sendSelection(tab)
})

browser.action.onClicked.addListener(async (tab) => {
  if (tab.url && /^https:\/\/soundcloud\.com\//.test(tab.url)) {
    try {
      await browser.tabs.sendMessage(tab.id, { type: 'tracklister:collect' })
      return
    } catch {
      // Content script not ready (tab opened before install) — fall back to selection.
    }
  }
  const sent = await sendSelection(tab).catch(() => false)
  if (!sent) {
    await openTracklister({ name: cleanTitle(tab.title), text: '', source: tab.url }, tab)
  }
})

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'tracklister:open' && message.payload) {
    return openTracklister(message.payload, sender.tab).then(() => true)
  }
  return undefined
})
