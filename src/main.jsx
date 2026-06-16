import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
// Apply stored theme preferences before first render to prevent flash
import '@/hooks/usePreferences'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

