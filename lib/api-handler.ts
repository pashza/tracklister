import { resolveTracks, type TrackInput } from './resolveTracks'

export const config = {
  maxDuration: 300,
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export function OPTIONS(): Response {
  return json({ ok: true })
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { tracks?: TrackInput[] }
    const tracks = body.tracks ?? []

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return json({ error: 'Provide a non-empty tracks array.' }, 400)
    }

    if (tracks.length > 100) {
      return json({ error: 'Max 100 tracks per request.' }, 400)
    }

    for (const track of tracks) {
      if (!track?.title || !track?.query) {
        return json({ error: 'Each track needs title and query.' }, 400)
      }
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await resolveTracks(tracks, (done, total, result) => {
            controller.enqueue(
              encoder.encode(JSON.stringify({ done, total, result }) + '\n'),
            )
          })
          controller.close()
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Resolve failed'
          controller.enqueue(encoder.encode(JSON.stringify({ error: message }) + '\n'))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('resolve failed', error)
    return json({ error: 'Invalid request body.' }, 400)
  }
}
