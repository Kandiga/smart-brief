import React from 'react'
import { createRoot } from 'react-dom/client'
import { CaptureOverlayApp } from './CaptureOverlayApp'
import '../styles/global.css'
import './overlay.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CaptureOverlayApp />
  </React.StrictMode>
)
