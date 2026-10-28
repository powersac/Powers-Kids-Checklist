import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The Worker (via `wrangler dev`, default port 8787) serves /api/* in dev too.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
