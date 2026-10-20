import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
// Apply stored theme preferences before first render to prevent flash
import '@/hooks/usePreferences'
import { installApiWriteTracking } from '@/lib/query-client'

installApiWriteTracking()

// iOS only applies :active (the pressed look on every button/row, index.css)
// when the page has a touchstart listener.
document.addEventListener('touchstart', () => {}, { passive: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

