/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Tauri 向けの設定
// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],

  // Tauri は固定ポートを期待する。空いていなければ黙って別ポートに逃げず失敗させる
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Rust 側のビルド成果物を監視対象から外す
      ignored: ['**/src-tauri/**'],
    },
  },

  // Rust 側のエラーが流れて消えないようにする
  clearScreen: false,

  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },

  build: {
    // 配布先は macOS 14 以降の Safari/WebKit なので、古い環境向けの変換は不要
    target: 'safari17',
    // minify は Vite 8 の既定（oxc）に任せる。
    // 'esbuild' を明示すると、別パッケージになった esbuild を要求されて失敗する
    sourcemap: false,
  },
})
