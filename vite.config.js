import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 이 앱이 배포되는 '절대' 서브경로. 매니페스트 정체성(id/scope/start_url)을
// 여기에 고정해, 같은 origin(chanwooklee83.github.io)의 다른 PWA(예: MoldGuard)와
// 설치 정체성/스코프가 충돌하지 않게 한다.
//  - GitHub Pages: 워크플로(pages.yml)가 VITE_BASE=/<저장소이름>/ 을 주입
//    → 이 저장소는 /vision-master-block-pwa-/ (이름 끝에 '-' 있음)
//  - 사내 IIS 등 다른 경로: VITE_BASE 로 덮어쓴다 (예: /vmb/)
//  - 로컬 dev 서버만 base 를 '/'로 둬 개발 편의를 유지 (정체성은 그대로 고정)
const APP_PATH = process.env.VITE_BASE || '/vision-master-block-pwa-/';

export default defineConfig(({ command }) => {
  const base = command === 'build' ? APP_PATH : '/';

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg'],
        manifest: {
          // 절대 경로로 '고정'. './' 나 '/' 로 두면 id 가 origin 루트로 해석돼
          // 같은 origin 의 다른 앱과 설치 정체성이 겹치고, scope 가 루트면
          // 다른 앱(MoldGuard 등) 경로까지 삼켜 설치·SW 충돌이 난다.
          id: APP_PATH,
          name: '측정관리 이력관리 시스템',
          short_name: '측정관리',
          description: '도면 번호 지정 · 주간 치수 측정 · 공차 OK/NG 자동 판정 · 이력 관리 (오프라인)',
          lang: 'ko',
          dir: 'ltr',
          // start_url · scope 도 이 앱의 하위 경로로 한정 — 루트('/') 금지
          start_url: APP_PATH,
          scope: APP_PATH,
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          categories: ['productivity', 'utilities'],
          orientation: 'any',
          background_color: '#0f172a',
          theme_color: '#37718e',
          icons: [
            { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
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
  };
});
