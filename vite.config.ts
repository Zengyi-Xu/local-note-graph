import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
    watch: {
      // 不监视打包产物与仓库外的备份：electron-builder 打包时 release/ 下的
      // electron.exe 会被占用，chokidar 会抛 EBUSY 并直接终止 dev server。
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/release/**',
        '**/dist/**',
        '**/.backups/**',
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
