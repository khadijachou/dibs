import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Lets a cloudflared or ngrok HTTPS tunnel reach the dev server.
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
