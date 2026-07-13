# Tracklister

Paste a DJ tracklist. Get **direct** YouTube video links (and Spotify track links).

Built for workflows like MediaHuman YouTube to MP3 — copied links are `youtube.com/watch?v=…`, not search pages.

## Features

- Paste messy tracklists (`Artist: Title`, `Artist - Title`, numbered lines, headers)
- Resolve each line to a **direct YouTube video URL**
- Optional **direct Spotify track URLs** (needs free Spotify API credentials)
- Copy all links, YouTube-only URLs, or markdown

## How it works

The UI is a static Vite app. A small **Vercel serverless function** (`/api/resolve`) does the heavy lifting:

1. Parse artist + title
2. Optionally enrich names via Apple’s iTunes Search API
3. Search YouTube with [youtubei.js](https://github.com/LuanRT/YouTube.js) (InnerTube — no YouTube API key)
4. Pick the best matching video from the first results
5. If Spotify credentials are set, search Spotify and return the track URL

Client-only search URLs were intentionally removed — download tools treat search pages as playlists of hundreds of results.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server also hosts `/api/resolve`.

```bash
npm run build
npm run preview   # static UI only — API needs `vercel dev` or a deploy
```

## Deploy on Vercel

1. Import the GitHub repo in Vercel (or `npx vercel`)
2. Framework: **Vite**
3. Deploy — no env vars required for YouTube

### Optional: Spotify direct links

Create a free app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), then add:

```bash
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
```

Locally, put them in `.env` (Vite/Node) or `.env.local` for `vercel dev`.

Without these, YouTube still works; Spotify buttons are simply omitted.

## API

`POST /api/resolve`

```json
{
  "tracks": [
    { "artist": "Asura", "title": "Le Dernier Voyage", "query": "Asura Le Dernier Voyage" }
  ]
}
```

Streams [NDJSON](https://github.com/ndjson/ndjson-spec) progress lines:

```json
{"done":1,"total":1,"result":{"displayArtist":"Asura","displayTitle":"Le Dernier Voyage","youtube":"https://www.youtube.com/watch?v=…","youtubeTitle":"…","spotify":null,"artwork":null}}
```

## License

MIT
