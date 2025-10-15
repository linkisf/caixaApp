import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true
    },
    proxy: {
      // tudo que começar com /api vai para o container backend
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
        // não reescreva o caminho; já usamos /api na app
        // rewrite: (path) => path
      }
    }
  }
})
