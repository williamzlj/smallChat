// 自定义 Service Worker（vite-plugin-pwa injectManifest 模式，构建时自动注入预缓存清单）
//
// 根因说明（2026-10 安卓 Chrome 图片上传失败，提示「上传失败，网络错误」）：
// 页面被 Service Worker 控制后，所有请求（含跨域 multipart POST 上传）都会先派发到
// SW 的 fetch 事件。此前 workbox generateSW 生成的 SW 只在路由匹配时按 GET 方法过滤，
// fetch 处理器并没有显式跳过非 GET 请求；安卓 Chrome（Chromium 内核）在 SW fetch 分发
// 路径下处理「带 Blob 文件的 multipart POST」存在缺陷：请求体流在经 SW 转发/回退网络的
// 过程中丢失或被打断，导致 XHR 与 fetch 上传双双在网络层失败（status 0 / Failed to fetch）。
// 普通文本 POST 请求体小不受影响，安卓 Firefox 与 iOS（WebKit 内核）也均正常。
// 修复：fetch 事件处理器顶部显式放行一切非 GET 请求直接走网络；
// 同时 API 请求（api.php）永不进入任何缓存策略。
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

// 本项目 tsconfig 仅含 DOM lib（无 WebWorker lib），此处声明 SW 全局对象的最小类型
declare global {
  interface Window {
    // 预缓存清单占位符：workbox-build 按字面量字符串匹配 self.__WB_MANIFEST 进行注入，不能改写
    __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0];
  }
}
const sw = self as unknown as {
  skipWaiting: () => void;
  addEventListener: (type: 'fetch', listener: (event: Event & { request: Request }) => void) => void;
};

// 上传等写请求：一律绕过 SW 直接走网络（见文件头根因说明）
sw.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // API 请求绝不进入缓存策略（现有缓存规则本就不匹配 api.php，此处双保险）
  if (new URL(event.request.url).pathname.endsWith('/api.php')) return;
});

sw.skipWaiting();
clientsClaim();

// 预缓存构建产物（清单由 vite-plugin-pwa 构建时注入；必须保持字面量 self.__WB_MANIFEST）
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA 导航回退到 index.html
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// 以下为运行时缓存，全部仅匹配 GET 请求（与原 generateSW 配置一致）

// 图片资源
registerRoute(
  /^https?:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }), // 30天
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  'GET',
);

// Google Fonts 样式与字体文件
registerRoute(
  /^https?:\/\/fonts\.googleapis\.com\/.*/,
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })], // 1年
  }),
  'GET',
);
registerRoute(
  /^https?:\/\/fonts\.gstatic\.com\/.*/,
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })], // 1年
  }),
  'GET',
);

// CDN 资源
registerRoute(
  /^https?:\/\/.*\.jsdelivr\.net\/.*/,
  new StaleWhileRevalidate({
    cacheName: 'cdn-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 })], // 30天
  }),
  'GET',
);
