import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// 应用高度以 visualViewport 实时高度为准（--app-height）。
// Android Chrome 在地址栏/系统导航条显示隐藏时，100dvh 可能滞后于实际可视区，
// 导致底部输入框被挤出屏幕或压在导航条下；iOS 键盘弹出时也能及时收缩。
const applyViewportHeight = () => {
  const vv = window.visualViewport
  if (!vv || vv.scale !== 1) return
  document.documentElement.style.setProperty('--app-height', `${Math.round(vv.height)}px`)
}

applyViewportHeight()
window.visualViewport?.addEventListener('resize', applyViewportHeight)
window.addEventListener('orientationchange', applyViewportHeight)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)