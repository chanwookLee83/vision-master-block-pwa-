import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages: 저장소 이름으로 base 지정 (환경변수로 덮어쓰기 가능)
const base = process.env.VITE_BASE || './';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        id: './',
        name: 'Vision Master Block 측정관리',
        short_name: 'VMB 측정',
        description: 'Vision Master Block 도면 번호 지정 · 주간 치수 측정 · 공차 OK/NG 자동 판정 (오프라인)',
        lang: 'ko',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        categories: ['productivity', 'utilities'],
        orientation: 'any',
        background_color: '#0f172a',
        theme_color: '#4f46e5',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // OCR(치수 자동 읽기) 자산까지 프리캐시해 완전 오프라인 동작 보장
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,gz}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html'
      }
    })
  ]
});
