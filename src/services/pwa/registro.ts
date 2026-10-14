/**
 * REGISTRO DEL SERVICE WORKER
 * ==========================
 * El service worker vive en `public/sw.js` (Vite lo copia tal cual a `dist/`),
 * así que se registra en `${BASE_URL}sw.js`. Con `base = '/plantapps/'` la ruta
 * final es `/plantapps/sw.js` y su scope `/plantapps/`: correcto en GitHub Pages.
 *
 * Solo se registra en producción: en desarrollo el service worker cachearía el
 * código viejo de Vite y las recargas dejarían de verse.
 */

/** Ruta del service worker ya resuelta con el `base` del proyecto. */
export const RUTA_SERVICE_WORKER = `${import.meta.env.BASE_URL}sw.js`

/**
 * Registra el service worker. No devuelve nada, no espera y **nunca lanza**:
 * si el navegador no lo soporta (o está en modo privado en iOS) la app sigue
 * funcionando, solo que sin modo offline.
 *
 * Llamar una sola vez, al arrancar (en `src/main.tsx`).
 */
export function registrarServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  try {
    navigator.serviceWorker.register(RUTA_SERVICE_WORKER, { scope: import.meta.env.BASE_URL }).catch(() => {
      // Sin SW no hay modo offline, pero la app (con sus datos en IndexedDB)
      // sigue funcionando: no merece la pena molestar al usuario con esto.
    })

    // `ready` no bloquea nada: solo avisamos por si algún día hace falta depurar.
    navigator.serviceWorker.ready.catch(() => {})
  } catch {
    // Si hasta aquí falla (políticas raras del navegador), tampoco pasa nada.
  }
}