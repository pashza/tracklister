import { defineConfig, loadEnv, type Plugin } from 'vite'
import { resolveTracks, type TrackInput } from './lib/resolveTracks'

function resolveApiPlugin(): Plugin {
  return {
    name: 'tracklister-resolve-api',
    configureServer(server) {
      server.middlewares.use('/api/resolve', (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        if (req.method !== 'POST') {
          next()
          return
        }

        const chunks: Buffer[] = []
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        req.on('end', () => {
          void (async () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
                tracks?: TrackInput[]
              }
              const tracks = body.tracks ?? []
              if (!Array.isArray(tracks) || tracks.length === 0) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Provide a non-empty tracks array.' }))
                return
              }

              res.statusCode = 200
              res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
              res.setHeader('Cache-Control', 'no-store')

              await resolveTracks(tracks, (done, total, result) => {
                res.write(JSON.stringify({ done, total, result }) + '\n')
              })
              res.end()
            } catch (error) {
              console.error(error)
              if (!res.headersSent) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Resolve failed.' }))
              } else {
                res.end()
              }
            }
          })()
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.SPOTIFY_CLIENT_ID) process.env.SPOTIFY_CLIENT_ID = env.SPOTIFY_CLIENT_ID
  if (env.SPOTIFY_CLIENT_SECRET) {
    process.env.SPOTIFY_CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET
  }

  return {
    plugins: [resolveApiPlugin()],
    server: {
      port: 5173,
    },
  }
})
