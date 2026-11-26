import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { registerServiceWorker } from './shared/offline/registerServiceWorker'
import './index.css'
import './content-theme.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Élément #root introuvable dans index.html.')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ouverture sans réseau (lot 2, D-064), en production seulement.
registerServiceWorker()
