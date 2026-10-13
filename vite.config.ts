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
        // No runtime caching for JS/CSS.
        //
        // This used to register a `CacheFirst` rule for `\.js$`, `\.css$` and
        // friends with a 30-day expiry. `CacheFirst` serves whatever is already
        // cached and does not revalidate, so once a bundle was cached the app
        // kept running that exact build for a month. `registerType: 'autoUpdate'`
        // does not help: it updates the service worker, but this rule answers
        // the asset request from its own cache before the worker ever sees it.
        //
        // It was also redundant. Vite emits content-hashed filenames
        // (`AppPage-D3fxX-Rt.js`), so a new build never collides with a cached
        // URL, and every one of those assets is already in the precache manifest
        // -- which is what actually delivers updates correctly.
        //
        // The symptom this caused was a stale bundle throwing
        // "Missing Supabase environment variables" after a rebuild that had
        // baked the values in correctly.
      },
    }),
  ],
  preview: {
    port: 3000,
  },
})
