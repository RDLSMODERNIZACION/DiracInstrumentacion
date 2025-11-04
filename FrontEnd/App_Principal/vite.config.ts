// vite.config.ts (APP principal)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 👉 Proyecto de Vercel de Instrumentación
const INSTRUMENTACION_TARGET = 'https://dirac-instrumentacion.vercel.app'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    watch: { usePolling: true, interval: 200 },
    // 👇 En dev: sirve /instrumentacion desde el proyecto de Vercel
    proxy: {
      '/instrumentacion': {
        target: INSTRUMENTACION_TARGET,
        changeOrigin: true,
        ws: true,
        secure: true
      }
    }
  }
})
