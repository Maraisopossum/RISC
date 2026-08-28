import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Servi par GitHub Pages sous https://maraisopossum.github.io/RISC/
export default defineConfig({
  base: '/RISC/',
  plugins: [react(), tailwindcss()],
})
