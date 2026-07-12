# Tracklister

Paste a DJ tracklist. Get YouTube and Spotify links.

A tiny, client-only web app — no accounts, no API keys, no backend. Everything runs in the browser.

## Features

- Paste messy tracklists (`Artist: Title`, `Artist - Title`, numbered lines, headers)
- Open each track on **YouTube** or **Spotify**
- **Copy all links**, YouTube-only URLs, or markdown to the clipboard
- Optional artwork enrichment via Apple’s public iTunes Search API

## Usage

1. Paste your tracklist
2. Click **Find links** (or press `Ctrl`/`Cmd` + `Enter`)
3. Open links, or hit **Copy all links**

Example input:

```text
~ Tracklist ~

Asura: Le Dernier Voyage
Total Eclipse - Kia (Toirés Remix)
Seamoon: Drop & Fall
```

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Deploy on Vercel

This is a static Vite app. No environment variables needed.

1. Push the repo to GitHub
2. Import it in [Vercel](https://vercel.com/new)
3. Deploy — framework preset: **Vite**, output: `dist`

Or from the CLI:

```bash
npx vercel
```

## How it works

Tracklister parses each line into artist + title, optionally looks up metadata with the [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html) (CORS-friendly, no key), then builds YouTube and Spotify search URLs for every track.

YouTube and Spotify don’t expose a free, keyless browser API, so links open search results for that track — usually the right video/song is first.

## License

MIT
