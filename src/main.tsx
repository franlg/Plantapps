import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { db } from './db'
import { DbProvider } from './db/context'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DbProvider db={db}>
      <App />
    </DbProvider>
  </StrictMode>,
)