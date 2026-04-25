import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'

// 阻止 Electron 默认的拖拽导航行为，让组件自己处理 drop
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
