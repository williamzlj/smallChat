import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// 应用高度以 visualViewport 实时高度为准（--app-height）。
// Android Chrome 在地址栏/系统导航条显示隐藏时，100dvh 可能滞后于实际可视区，
// 导致底部输入框被挤出屏幕或压在导航条下；iOS 键盘弹出时也能及时收缩。
// 同时记录可视区相对布局视口的偏移（--app-top）：iOS Chrome 键盘弹出时会把
// visualViewport 整体下移，而 position:fixed 仍按布局视口定位，弹窗会跑到可视区
// 上方、下方露出一大片空白，需要用该偏移把弹窗拉回可视区。
const applyViewportMetrics = () => {
  const vv = window.visualViewport
  if (!vv || vv.scale !== 1) return
  const root = document.documentElement
  root.style.setProperty('--app-height', `${Math.round(vv.height)}px`)
  root.style.setProperty('--app-top', `${Math.round(vv.offsetTop)}px`)
}

applyViewportMetrics()
window.visualViewport?.addEventListener('resize', applyViewportMetrics)
// 键盘弹出/收起时 iOS 只会触发 scroll 而不一定触发 resize
window.visualViewport?.addEventListener('scroll', applyViewportMetrics)
window.addEventListener('orientationchange', applyViewportMetrics)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)