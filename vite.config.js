import { defineConfig } from 'vite';

// 웹 배포(GitHub Pages)는 절대경로 '/lagomorph/',
// 모바일(Capacitor, file:// 로 로드)은 상대경로 './' 가 필요하다.
// 모바일 빌드는 `vite build --mode mobile` 로 분기한다.
export default defineConfig(({ mode }) => ({
  base: mode === 'mobile' ? './' : '/lagomorph/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    host: true, // LAN 접근 허용 (모바일 테스트용)
  },
}));
