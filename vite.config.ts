import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'site.webmanifest', 'background.svg'],
      manifest: {
        name: 'AnthroWeb',
        short_name: 'AnthroWeb',
        description: 'Personal tracking and planning workspace',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.ico',
            sizes: '48x48',
            type: 'image/x-icon',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css|woff2?|ttf|svg|png|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'anthroweb-static',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  preview: {
    port: 3000,
  },
})
