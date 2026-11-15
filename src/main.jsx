import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// The TV dashboard lives at /tv (public/tv/index.html forwards to /?tv so it
// works on any static host). It's loaded lazily to keep the phone app lean.
const TvView = lazy(() => import('./TvView.jsx'))
const isTv = /^\/tv\/?$/.test(window.location.pathname) || new URLSearchParams(window.location.search).has('tv')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isTv ? <Suspense fallback={null}><TvView /></Suspense> : <App />}
  </StrictMode>,
)

// Register the service worker so the app is installable and works offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
