import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Matches the original app's (github.com/saher987/zaffaf) @/* alias —
      // ported pages/components use it throughout, unchanged.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
