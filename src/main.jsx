import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted Suwannaphum (Khmer + Latin), weights 400/700.
// Bundled locally so the app loads no remote resources at runtime.
import '@fontsource/suwannaphum/400.css'
import '@fontsource/suwannaphum/700.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
