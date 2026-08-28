import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// Servi par GitHub Pages sous https://maraisopossum.github.io/RISC/
export default defineConfig({
  base: '/RISC/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Les données (Supabase) ne sont jamais mises en cache ici : seule
      // l'appli (HTML/JS/CSS) est disponible hors-ligne. Les écrans gèrent
      // eux-mêmes l'absence de réseau (voir src/lib/offline.ts).
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      manifest: {
        name: 'Inventaire RISC',
        short_name: 'RISC',
        description: 'Suivi du matériel RISC (EPI, cordes, quincaillerie)',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/RISC/',
        scope: '/RISC/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
