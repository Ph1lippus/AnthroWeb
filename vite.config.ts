import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Refuse to build a bundle that will crash on load.
 *
 * Vite replaces `import.meta.env.VITE_*` textually at build time. A variable that
 * is not set does not produce a build warning or a non-zero exit -- it produces
 * `undefined` inside the bundle, and the app then throws
 * "Missing Supabase environment variables" in the browser, on a page that looks
 * deployed and fine until somebody opens it.
 *
 * That is the worst possible place to find out, because the build that produced
 * it was green. It has already shipped at least once, and the only thing that
 * noticed was a person opening the site.
 *
 * So `build` fails here instead. This is the same class of problem as the
 * Android manifest: a failure that nothing local can see, found downstream at
 * the worst possible moment. Failing the build puts it at the start instead.
 *
 * `dev` is deliberately not gated. A missing `.env` in development should show
 * the error in the console where it can be fixed, not stop the server booting.
 *
 * These are publishable values, not secrets -- they are inlined into the bundle
 * and readable by anyone who visits the site. The one that must never appear in a
 * `VITE_`-prefixed variable is the service_role key.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
  const missing = required.filter(name => !env[name])

  if (mode === 'production' && missing.length > 0) {
    throw new Error(
      [
        '',
        `Cannot build for production: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set.`,
        '',
        '  Locally:      copy .env.example to .env and fill both values in.',
        '  On Vercel:    Project -> Settings -> Environment Variables, add them,',
        '                and confirm the environment this build targets has them',
        '                (Preview builds do not inherit Production variables).',
        '',
        '  These are publishable values from Supabase -> Project Settings -> API.',
        '  They are baked into the bundle by design and are not secrets. Never put',
        '  a service_role key in a VITE_ variable.',
        '',
      ].join('\n'),
    )
  }

  return {
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
  }
})
