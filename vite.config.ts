import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 部署需要知道仓库名
const repoName = 'smallChat' // 你的 GitHub 仓库名称
const isProduction = process.env.NODE_ENV === 'production'

export default defineConfig({
  // GitHub Pages 需要设置 base 为仓库名
  base: isProduction && repoName ? `/${repoName}/` : '/',
  plugins: [
    react(),
    VitePWA({
      // injectManifest：使用自定义 SW（src/sw.ts），以便在 fetch 处理器顶部显式放行
      // 非 GET 请求——修复安卓 Chrome 下 SW 分发路径导致 multipart 上传 body 丢失的问题
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png', 'manifest.json', 'icon.svg'],
      injectManifest: {
        // 预缓存所有静态资源（缓存策略见 src/sw.ts）
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      },
      manifest: {
        name: 'smallChat',
        short_name: 'smallChat',
        description: '多设备信息同步工具',
        theme_color: '#22c55e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: isProduction && repoName ? `/${repoName}/` : '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
      // 运行时缓存策略已迁移到自定义 SW（src/sw.ts），injectManifest 模式不再使用 workbox 选项
    })
  ],
})
