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

  build: {
    // Apple Silicon 専用（要件 2.1）
    target: 'safari15',
    minify: 'esbuild',
    sourcemap: false,
  },
})
