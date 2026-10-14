/* eslint-env serviceworker */
/**
 * SERVICE WORKER DE PLANTAPPS
 * ===========================
 * A mano, sin librerías. Su trabajo es que la app abra y funcione SIN INTERNET:
 * todo lo que es estático (el código ya compilado) vive en una caché y la
 * pantalla se sirve de la caché cuando no hay red. Lo único que necesita
 * conexión es el análisis con IA de Gemini, y eso nunca se cachea.
 *
 * Rutas: la app se publica en https://<usuario>.github.io/plantapps/, así que
 * NADA de esto puede usar rutas absolutas a la raíz del dominio. Todo se
 * resuelve a partir de la ubicación del propio service worker (`BASE`).
 *
 * IMPORTANTE al publicar cambios: sube `CACHE_VERSION`. Al activarse la versión
 * nueva, el `activate` borra las cachés viejas y todo se vuelve a pedir a la red.
 */

const CACHE_VERSION = 'v1'
const PREFIJO_CACHE = 'plantapps-'
const CACHE_NAME = `${PREFIJO_CACHE}${CACHE_VERSION}`

/** Carpeta donde vive la app: '/plantapps/' en producción. */
const BASE = new URL('./', self.location).pathname

/**
 * App shell mínimo: sin esto la app NO abre sin conexión la primera vez.
 * Solo lo justo (HTML, manifiesto e iconos). El JS y el CSS compilados, que
 * llevan hash en el nombre, se cachean solos con la estrategia cache-first.
 */
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/favicon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
]

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      // Uno a uno y sin propagar fallos: que falte un icono no puede impedir
      // que se instale el service worker y la app se quede sin cachear.
      await Promise.all(
        PRECACHE.map(async (ruta) => {
          try {
            await cache.add(new Request(new URL(ruta, self.location), { cache: 'reload' }))
          } catch (error) {
            console.error('[sw] no se pudo precachear', ruta, error)
          }
        }),
      )
      // Activamos la versión nueva sin esperar: así la siguiente carga ya usa
      // este service worker y el usuario no nota esperas.
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const claves = await caches.keys()
      await Promise.all(
        claves
          .filter((clave) => clave.startsWith(PREFIJO_CACHE) && clave !== CACHE_NAME)
          .map((clave) => caches.delete(clave)),
      )
      // `clients.claim` hace que este SW controle también las pestañas abiertas
      // antes de instalarse, sin necesidad de recargar.
      await self.clients.claim()
    })(),
  )
})

/** La app avisa con `{ type: 'SKIP_WAITING' }` para activar la versión nueva. */
self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ---------------------------------------------------------------------------
// Estrategias
// ---------------------------------------------------------------------------

/** resources con hash (JS/CSS de Vite) e iconos: caché primero. */
function esEstatico(url) {
  if (url.pathname.startsWith(`${BASE}assets/`)) return true
  if (url.pathname.startsWith(`${BASE}icons/`)) return true
  return /\.[0-9a-f]{8,}\.(?:js|css|woff2?|png|svg|jpg|webp)$/i.test(url.pathname)
}

/** Pantallas: red primero (así se ven los cambios al publicar) y si no hay red, caché. */
async function navegacion(peticion) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const respuesta = await fetch(peticion)
    if (respuesta && respuesta.ok) {
      // Sin `await` a propósito: no queremos retrasar la respuesta. Si la
      // caché falla (cuota, etc.) solo se pierde esta copia.
      cache.put(peticion, respuesta.clone()).catch(() => {})
    }
    return respuesta
  } catch {
    const guardada = await cache.match(peticion, { ignoreVary: true, ignoreSearch: true })
    if (guardada) return guardada
    // Último recurso: el index.html precacheado. La app es una SPA, así que
    // con ese documento el enrutador vuelve a dibujar la pantalla correcta.
    const indice =
      (await cache.match(`${BASE}index.html`, { ignoreVary: true })) ||
      (await cache.match(`${BASE}`, { ignoreVary: true }))
    if (indice) return indice
    return new Response(
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Sin conexion</title></head>' +
        '<body style="font-family:system-ui;padding:2rem"><h1>Sin conexion</h1>' +
        '<p>Abre Plantapps con internet una vez para poder usarla sin conexion.</p></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}

/** Estáticos con hash: caché primero y, si no está, se guarda para siempre. */
async function cachePrimero(peticion) {
  const cache = await caches.open(CACHE_NAME)
  const guardada = await cache.match(peticion, { ignoreVary: true })
  if (guardada) return guardada
  const respuesta = await fetch(peticion)
  if (respuesta && respuesta.ok && respuesta.type === 'basic') {
    cache.put(peticion, respuesta.clone()).catch(() => {})
  }
  return respuesta
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request

  // Solo GET: los POST a Gemini (análisis con IA) pasan sin tocar nada.
  if (peticion.method !== 'GET') return

  const url = new URL(peticion.url)

  // CACHEAR NADA QUE NO SEA NUESTRO. Aquí caen todas las peticiones a
  // generativelanguage.googleapis.com (y a cualquier otro dominio): van
  // siempre a la red, jamás a la caché, ni de paso ni por error.
  if (url.origin !== self.location.origin) return

  if (peticion.mode === 'navigate') {
    evento.respondWith(navegacion(peticion))
    return
  }

  if (esEstatico(url)) {
    evento.respondWith(cachePrimero(peticion))
    return
  }

  // Todo lo demás: network-only. Sin respondWith el navegador hace su cosa.
})