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

/** Cuánto se espera a que haya un service worker activo antes de renunciar. */
const ESPERA_SERVICE_WORKER_MS = 3000

/**
 * Service worker con el que hablar, o `null` si no hay ninguno.
 *
 * Sale de aquí porque lo necesitan dos cosas muy distintas: avisar de una
 * versión nueva (`useActualizacion`) y programar los avisos de riego
 * (`@/services/recordatorios`), y ninguna de las dos debe reimplementar el
 * "busca al que esté activo" con susTimeouts y sus `catch`.
 *
 * **Nunca lanza y nunca se queda esperando indefinidamente**: si no hay service
 * worker (navegador sin soporte, modo privado, o desarrollo, donde el
 * registro está desactivado) devuelve `null` y quien llama sigue su camino.
 *
 * Se prefiere el que **controla** la página; si todavía no hay ninguno (la
 * primera visita, recién instalado) se espera al que esté `active`, al que sí
 * se le puede mandar mensajes aunque todavía no gobierne esta pestaña.
 */
export async function obtenerServiceWorker(
  timeoutMs: number = ESPERA_SERVICE_WORKER_MS,
): Promise<ServiceWorker | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  const contenedor = navigator.serviceWorker

  try {
    if (contenedor.controller) return contenedor.controller

    let reloj: ReturnType<typeof setTimeout> | undefined
    const espera = new Promise<null>((resolve) => {
      reloj = setTimeout(() => resolve(null), timeoutMs)
    })
    const registro = await Promise.race([contenedor.ready.catch(() => null), espera])
    if (reloj !== undefined) clearTimeout(reloj)

    return registro?.active ?? null
  } catch {
    return null
  }
}