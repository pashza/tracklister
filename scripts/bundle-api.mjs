import * as esbuild from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('api', { recursive: true })

await esbuild.build({
  entryPoints: ['lib/api-handler.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'api/resolve.js',
  // Keep node_modules external — Vercel installs them for the function.
  packages: 'external',
  logLevel: 'info',
})

console.log('Bundled api/resolve.js')
