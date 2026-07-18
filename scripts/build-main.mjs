import { build } from 'esbuild'

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: false,
  minify: false
}

await build({
  ...common,
  entryPoints: ['src/main/main.ts'],
  outfile: 'dist/main/main.cjs'
})

await build({
  ...common,
  entryPoints: ['src/preload/preload.ts'],
  outfile: 'dist/preload/preload.cjs'
})

console.log('main + preload bundled')
