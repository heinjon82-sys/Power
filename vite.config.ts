import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'background-poster.webp', 'background-loop.mp4', 'exercise-image-manifest.json', 'exercises/*.webp'],
      manifest: {
        name: 'Punttis',
        short_name: 'Punttis',
        description: 'Oma treeniseuranta',
        theme_color: '#090d14',
        background_color: '#090d14',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait-primary',
        icons: [
          { src: 'pwa-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
        runtimeCaching: [{
          urlPattern: /\/media\/.*\.webp$/,
          handler: 'CacheFirst',
          options: { cacheName: 'exercise-images', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 } }
        }]
      }
    })
  ],
  server: { host: '127.0.0.1' }
})
