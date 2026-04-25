import React from 'react'
import ReactDOM from 'react-dom/client'
import { Canvas } from './Canvas'
import './canvas.css'

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
  <React.StrictMode>
    <Canvas />
  </React.StrictMode>
)
