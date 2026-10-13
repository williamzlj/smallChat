# PWA 配置说明

## 已完成的工作

✅ 安装了 `vite-plugin-pwa` 和 `workbox-window` 依赖
✅ 配置了 `vite.config.ts` 添加了 PWA 插件
✅ 创建了 `public/manifest.json` 文件
✅ 更新了 `index.html` 添加了必要的 meta 标签

## 还需要完成的步骤

### 1. 生成 PWA 图标

你需要生成以下尺寸的 PNG 图标，放置在 `public/` 目录下：

- `pwa-192x192.png` (192x192 像素)
- `pwa-512x512.png` (512x512 像素)

你可以使用以下在线工具生成图标：
- https://realfavicongenerator.net/
- https://www.pwabuilder.com/imagegenerator

或者使用 `pwa-asset-generator` npm 工具：

```bash
npm install -g pwa-asset-generator
# 准备一张源图标 (source.png)，然后运行：
pwa-asset-generator source.png public/ --icon-only --padding 20% --background "#22c55e"
```

### 2. 构建生产版本

```bash
npm run build
```

构建完成后，vite-plugin-pwa 会自动在 `dist/` 目录下生成：
- `manifest.json`
- `sw.js` (Service Worker)
- `workbox-*.js`

### 3. 部署

你可以将 `dist/` 目录部署到任何静态文件托管服务：
- GitHub Pages
- Vercel
- Netlify
- Cloudflare Pages
- 或者你自己的服务器

**注意**：PWA 需要 HTTPS 环境（localhost 除外）

### 4. 测试 PWA

部署完成后，在手机浏览器（Chrome、Safari）中打开网站：
- Android/Chrome：点击菜单 → "添加到主屏幕"
- iOS/Safari：点击分享 → "添加到主屏幕"

## 自定义配置

你可以在 `vite.config.ts` 中修改以下配置：
- `name` 和 `short_name`：应用名称
- `theme_color`：主题色
- `background_color`：启动画面背景色
- `description`：应用描述

## 验证 PWA

你可以使用 Lighthouse 工具验证 PWA 的合规性：
1. 在 Chrome DevTools 中打开 Lighthouse 标签
2. 勾选 "Progressive Web App"
3. 运行分析
