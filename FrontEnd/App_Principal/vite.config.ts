// vite.config.ts (APP principal)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const INSTRUMENTACION_TARGET = 'https://dirac-instrumentacion.vercel.app'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    watch: { usePolling: true, interval: 200 },
    proxy: {
      // Sirve /instrumentacion desde el proyecto remoto, pero
      // mapeando a su raíz para evitar el loop
      '^/instrumentacion(/.*)?': {
        target: INSTRUMENTACION_TARGET,
        changeOrigin: true,
        ws: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/instrumentacion/, ''),  // 👈 clave
      },
      // (opcional) si la app remota sirve assets absolutos
      '^/assets(/.*)?': {
        target: INSTRUMENTACION_TARGET,
        changeOrigin: true,
        secure: true,
      },
      '^/_next(/.*)?': { // por si fuera Next
        target: INSTRUMENTACION_TARGET,
        changeOrigin: true,
        secure: true,
      }
    }
  }
})
