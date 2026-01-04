import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Expose on all network interfaces (0.0.0.0)
    proxy: {
      // Auth endpoints (no prefix - auth_bp has no url_prefix)
      '/firebase-config': 'http://localhost:5000',
      '/set_session': 'http://localhost:5000',
      '/check_session': 'http://localhost:5000',
      '/logout': 'http://localhost:5000',
      // All api_bp routes use /api prefix
      '/api': 'http://localhost:5000',
    },
  },
})
