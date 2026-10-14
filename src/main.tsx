import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { db } from './db'
import { DbProvider } from './db/context'
import { registrarServiceWorker } from '@/services/pwa'
import { aplicarTema, temaInicial } from '@/ui/screens/datos'

/**
 * Arranque.
 *
 * Antes de pintar nada se aplica el tema: así la app no aparece en claro y
 * salta a oscuro en un móvil en modo oscuro, que es justo lo que más molesta.
 * Después se registra el service worker (una sola vez) y se refleja la conexión
 * en `<html data-conexion>`; el estado que usa React lo lleva `useOnline()`.
 */
aplicarTema(temaInicial())
registrarServiceWorker()

if (typeof window !== 'undefined') {
  const marcarConexion = () => {
    document.documentElement.dataset.conexion = navigator.onLine === false ? 'sin-red' : 'en-linea'
  }
  marcarConexion()
  window.addEventListener('online', marcarConexion)
  window.addEventListener('offline', marcarConexion)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DbProvider db={db}>
      <App />
    </DbProvider>
  </StrictMode>,
)