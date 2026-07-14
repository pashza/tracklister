// lib/resolveTracks.ts
var spotifyToken = null;
function normalize(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function scoreTextMatch(wanted, candidate) {
  if (!wanted || !candidate) return 0;
  if (candidate === wanted) return 6;
  if (candidate.includes(wanted)) return 4;
  if (wanted.includes(candidate) && candidate.length > 3) return 2;
  const wantedParts = wanted.split(" ").filter(Boolean);
  const hits = wantedParts.filter((part) => candidate.includes(part)).length;
  if (wantedParts.length === 0) return 0;
  return hits / wantedParts.length * 3;
}
async function lookupItunes(track) {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", track.query);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "8");
  try {
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const data = await response.json();
    const results = data.results ?? [];
    if (results.length === 0) return null;
    let best = null;
    let bestScore = -1;
    for (const song of results) {
      const score = scoreTextMatch(normalize(track.title), normalize(song.trackName ?? "")) + scoreTextMatch(normalize(track.artist ?? ""), normalize(song.artistName ?? ""));
      if (score > bestScore) {
        best = song;
        bestScore = score;
      }
    }
    return bestScore >= 3 ? best : null;
  } catch {
    return null;
  }
}
function scoreYoutubeHit(track, hit) {
  const title = normalize(hit.title);
  const author = normalize(hit.author);
  const wantedTitle = normalize(track.title);
  const wantedArtist = normalize(track.artist ?? "");
  let score = scoreTextMatch(wantedTitle, title) * 2;
  if (wantedArtist) {
    score += scoreTextMatch(wantedArtist, title) * 2;
    score += scoreTextMatch(wantedArtist, author);
  }
  if (/\b(official|full track|original)\b/i.test(hit.title)) score += 0.5;
  if (/\b(live|reaction|nightcore|sped up|slowed|mix|mashup)\b/i.test(hit.title)) score -= 2;
  return score;
}
async function searchYoutube(yt, track, displayArtist, displayTitle) {
  const query = `${displayArtist} ${displayTitle}`.trim();
  const search = await yt.search(query);
  const results = search.results ?? [];
  const hits = [];
  for (const item of results) {
    const row = item;
    if (row.type !== "Video") continue;
    if (row.is_live) continue;
    const id = row.id ?? row.video_id;
    if (!id) continue;
    const title = typeof row.title === "string" ? row.title : row.title?.toString?.() ?? "";
    if (!title) continue;
    hits.push({
      id,
      title,
      author: row.author?.name ?? ""
    });
    if (hits.length >= 8) break;
  }
  if (hits.length === 0) return null;
  let best = hits[0];
  let bestScore = -1;
  for (const hit of hits) {
    const score = scoreYoutubeHit(
      { ...track, artist: track.artist ?? displayArtist, title: displayTitle },
      hit
    );
    if (score > bestScore) {
      best = hit;
      bestScore = score;
    }
  }
  return {
    url: `https://www.youtube.com/watch?v=${best.id}`,
    title: best.title
  };
}
async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (spotifyToken && Date.now() < spotifyToken.expires_at) {
    return spotifyToken.access_token;
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data.access_token) return null;
  spotifyToken = {
    access_token: data.access_token,
    expires_at: Date.now() + ((data.expires_in ?? 3600) - 60) * 1e3
  };
  return spotifyToken.access_token;
}
async function searchSpotify(displayArtist, displayTitle) {
  const token = await getSpotifyToken();
  if (!token) return null;
  const q = `track:${displayTitle} artist:${displayArtist}`;
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", q);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", "1");
  try {
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.tracks?.items?.[0]?.external_urls?.spotify ?? null;
  } catch {
    return null;
  }
}
async function createYoutubeClient() {
  const { Innertube } = await import("youtubei.js");
  return Innertube.create();
}
async function resolveTrack(yt, track) {
  const itunes = await lookupItunes(track);
  const displayArtist = itunes?.artistName ?? track.artist ?? "Unknown artist";
  const displayTitle = itunes?.trackName ?? track.title;
  const [youtube, spotify] = await Promise.all([
    searchYoutube(yt, track, displayArtist, displayTitle).catch(() => null),
    searchSpotify(displayArtist, displayTitle).catch(() => null)
  ]);
  return {
    displayArtist,
    displayTitle,
    youtube: youtube?.url ?? null,
    youtubeTitle: youtube?.title ?? null,
    spotify,
    artwork: itunes?.artworkUrl100?.replace("100x100bb", "200x200bb") ?? null
  };
}
async function resolveTracks(tracks, onProgress) {
  const yt = await createYoutubeClient();
  const results = [];
  for (let i = 0; i < tracks.length; i++) {
    const result = await resolveTrack(yt, tracks[i]);
    results.push(result);
    await onProgress?.(i + 1, tracks.length, result);
  }
  return results;
}

// lib/api-handler.ts
var config = {
  maxDuration: 300
};
function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
function OPTIONS() {
  return json({ ok: true });
}
async function POST(request) {
  try {
    const body = await request.json();
    const tracks = body.tracks ?? [];
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return json({ error: "Provide a non-empty tracks array." }, 400);
    }
    if (tracks.length > 100) {
      return json({ error: "Max 100 tracks per request." }, 400);
    }
    for (const track of tracks) {
      if (!track?.title || !track?.query) {
        return json({ error: "Each track needs title and query." }, 400);
      }
    }
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await resolveTracks(tracks, (done, total, result) => {
            controller.enqueue(
              encoder.encode(JSON.stringify({ done, total, result }) + "\n")
            );
          });
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Resolve failed";
          controller.enqueue(encoder.encode(JSON.stringify({ error: message }) + "\n"));
          controller.close();
        }
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    console.error("resolve failed", error);
    return json({ error: "Invalid request body." }, 400);
  }
}
export {
  OPTIONS,
  POST,
  config
};
