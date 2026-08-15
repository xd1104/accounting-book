import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Deployed at https://<user>.github.io/accounting-book/
export default defineConfig({
  base: '/accounting-book/',
  plugins: [react(), tailwindcss()],
})
