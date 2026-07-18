import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ command }) => ({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [
    react(),
    {
      name: 'dev-csp',
      transformIndexHtml(html) {
        if (command === 'serve') {
          // Dev server needs websockets for HMR; production keeps the strict CSP.
          return html.replace(
            /content="default-src 'self'/,
            `content="default-src 'self' ws://localhost:* http://localhost:*`
          )
        }
        return html
      }
    }
  ],
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'src/renderer/index.html'),
        capture: path.resolve(__dirname, 'src/renderer/capture.html')
      }
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@': path.resolve(__dirname, 'src/renderer/src')
    }
  }
}))
