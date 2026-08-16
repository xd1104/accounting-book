import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { StoreProvider } from './store'
import { requestPersistence } from './lib/persist'
import { registerServiceWorker, watchForUpdates } from './lib/appUpdate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)

// Ask up front, so the browser is less likely to evict the ledger on its own.
requestPersistence()

window.addEventListener('load', () => {
  registerServiceWorker(`${import.meta.env.BASE_URL}sw.js`)
  watchForUpdates()
})
