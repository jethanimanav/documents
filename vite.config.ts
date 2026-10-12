import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable.png',
      ],
      manifest: {
        name: 'Personal Documents',
        short_name: 'Personal Docs',
        description: 'Personal document manager and client-only upload-size utility with Google Drive integration.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,mjs}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/, /^https:\/\/www\.googleapis\.com/, /^https:\/\/accounts\.google\.com/],
        runtimeCaching: [
          {
            // Explicitly forbid Service Worker from caching Google Drive API responses, metadata, and files
            urlPattern: /^https:\/\/(www\.)?googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Explicitly forbid Service Worker from caching Google accounts and authentication endpoints
            urlPattern: /^https:\/\/(accounts|drive)\.google\.com\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    host: true, // allow accessing from phone on local network
  },
});
