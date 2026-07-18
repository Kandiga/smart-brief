// Dev mode: start Vite dev server for the renderer, build main/preload once,
// then launch Electron pointed at the dev server.
import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import { build } from 'esbuild'

const server = await createServer({ configFile: 'vite.config.ts' })
await server.listen()
const url = server.resolvedUrls.local[0]
console.log('Vite dev server at', url)

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron']
}
await build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.cjs' })
await build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload/preload.cjs' })

const child = spawn('npx', ['electron', '.'], {
  stdio: 'inherit',
  env: { ...process.env, SMART_BRIEF_DEV_URL: url }
})
child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
