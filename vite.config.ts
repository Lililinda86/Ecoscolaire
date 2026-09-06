import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const buildReceipt = (): Plugin => {
  let mode = '', firebaseProjectId = '';
  return {
    name: 'sanitized-build-receipt',
    configResolved(config) { mode = config.mode; firebaseProjectId = String(config.env.VITE_FIREBASE_PROJECT_ID || 'unconfigured'); },
    generateBundle() {
      const candidate = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
      const sha = /^[a-f0-9]{40}$/.test(candidate) ? candidate : 'local-unverified';
      this.emitFile({ type: 'asset', fileName: 'build-receipt.json', source: JSON.stringify({ sha, mode, firebaseProjectId }) });
    }
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    buildReceipt(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'EcoScolaire',
        short_name: 'EcoScolaire',
        description: 'Application de gestion scolaire',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [] // Browser can fallback to default if missing, or we can add one later
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        sourcemap: true
      }
    })
  ],
  base: '/',
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        passes: 2,
      },
      mangle: {
        toplevel: true, // Obfuscator mangling
      },
      format: {
        comments: false,
      }
    }
  }
})
