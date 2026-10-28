import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/source-serif-4/latin-400.css'
import '@fontsource/source-serif-4/latin-ext-400.css'
import '@fontsource/source-serif-4/latin-400-italic.css'
import '@fontsource/source-serif-4/latin-ext-400-italic.css'
import '@fontsource/source-serif-4/latin-600.css'
import '@fontsource/source-serif-4/latin-ext-600.css'
import './styles/tokens.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
