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
 * Lo mismo, pero como URL completa. `clients.openWindow()` y `client.url` trabajan
 * con URLs absolutas, así que para abrir o comparar hay que usar esta.
 */
const BASE_ABSOLUTA = new URL('./', self.location).href

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

/** Icono que verás en el aviso del sistema. Mismo origen y misma base que el resto. */
const ICONO_AVISO = new URL('icons/icon-192.png', self.location).href

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
      // Avisos: los rearmamos en cada activación (ver la nota de limitaciones).
      await rearmaAvisos()
    })(),
  )
})

/** La app avisa con `{ type: 'SKIP_WAITING' }` para activar la versión nueva. */
self.addEventListener('message', (evento) => {
  const datos = evento.data
  if (!datos || typeof datos !== 'object') return

  if (datos.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }

  const puerto = evento.ports && evento.ports[0]

  if (datos.type === 'SINCRONIZAR_AVISOS') {
    evento.waitUntil(sincronizaAvisos(datos.items, puerto))
    return
  }
  if (datos.type === 'CANCELAR_AVISOS') {
    evento.waitUntil(cancelaAvisos(puerto))
    return
  }
  if (datos.type === 'PEDIR_ESTADO_AVISOS') {
    evento.waitUntil(respondeEstado(puerto))
    return
  }
  if (datos.type === 'PROBAR_AVISO') {
    evento.waitUntil(muestraAvisoDePrueba(datos, puerto))
  }
})

// ---------------------------------------------------------------------------
// AVISOS DE RIEGO
// ---------------------------------------------------------------------------
// La app envía la lista COMPLETA de avisos con `{ type: 'SINCRONIZAR_AVISOS' }`.
// Lo que no esté en esa lista se cancela, así que nunca se quedan avisos viejos.
//
// LÍMITE REAL Y HONESTO (no es un fallo que se pueda arreglar aquí):
// los temporizadores de un service worker (`setTimeout`) NO sobreviven a que el
// sistema mate el proceso, y Android mata los de una PWA cerrada con bastante
// facilidad. Tampoco existe la API `showTrigger`/alarma persistente que tienen
// las apps nativas. Consecuencia honesta: con la app cerrada del todo el aviso
// no suena. Lo que sí se hace es rearmar los temporizadores en CADA `activate`,
// en CADA mensaje y de forma periódica en cada `fetch`, de manera que en cuanto
// Android vuelve a despertar al worker (una visita, una notificación tocada, una
// carga de la propia app) los avisos se recuperan solos. Dentro de la app el
// aviso sale siempre en la pantalla "Requieren atención": eso no depende de nada
// de esto.

/** Base de datos propia del service worker para los avisos pendientes. */
const BD_AVISOS = 'plantapps-avisos'
const ALMACEN_AVISOS = 'pendientes'

/**
 * POR QUÉ INDEXEDDB Y NO localStorage
 * ---------------------------------
 * Un service worker se ejecuta sin `window`, así que no tiene `localStorage`.
 * La otra opción es pedirle a la página con `clients.matchAll()` que los guarde
 * en su `localStorage`, pero justo en el caso que importa (app cerrada, sin
 * ninguna pestaña abierta) no hay a quién preguntar: el truco se quedaría sin
 * hacer nada justo cuando más falta hace. IndexedDB sí está disponible dentro
 * del worker, es del mismo origen que la app y su contenido sobrevive a que el
 * worker sea destruido y vuelve a crearse, que es exactamente lo que se quiere.
 *
 * Si aun así no hubiera IndexedDB, la lista vive en memoria (ver `AVISOS_EN_MEMORIA`)
 * y los avisos solo suenan mientras este worker siga vivo. Se pierde el aviso,
 * nunca la app.
 */
let AVISOS_EN_MEMORIA = []

/** `setTimeout` no aguanta más de 2^31-1 ms (~24,8 días). */
const MAX_TIMEOUT_MS = 2147483647

/**
 * Cuánto puede retrasarse un aviso al despertar el worker (por ejemplo, porque
 * Android lo reinició) sin que se dé por perdido. Pasado esto, se descarta:
 * mejor un aviso de menos que un "toca regar" de hace tres semanas.
 */
const MARGEN_ATRASO_MS = 6 * 60 * 60 * 1000

/** Temporizadores vivos ahora mismo, por id de aviso. */
const TEMPORIZADORES = new Map()

/** Último rearme, para no tocar IndexedDB en cada petición. */
let ULTIMO_REARME = 0

/** Cada cuánto se rearman los avisos al recibir peticiones. */
const INTERVALO_REARME_MS = 5 * 60 * 1000

/** Abre (y crea si hace falta) la base de datos de los avisos. */
function abrirBd() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('este entorno no tiene IndexedDB'))
      return
    }
    const peticion = indexedDB.open(BD_AVISOS, 1)
    peticion.onupgradeneeded = () => {
      const bd = peticion.result
      if (!bd.objectStoreNames.contains(ALMACEN_AVISOS)) {
        bd.createObjectStore(ALMACEN_AVISOS, { keyPath: 'id' })
      }
    }
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
    peticion.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña'))
  })
}

/**
 * Ejecuta `accion` dentro de una transacción del almacén y cierra SIEMPRE la
 * conexión, también si algo falla: una conexión de IndexedDB abierta bloquea
 * cualquier actualización futura del esquema.
 *
 * `accion` recibe el almacén y un `fijar( valor )` para dejar lo leído, que solo
 * es válido mientras la transacción sigue viva.
 */
function conAlmacen(modo, accion) {
  return abrirBd().then((bd) => {
    bd.addEventListener('versionchange', () => bd.close())
    return new Promise((resolve, reject) => {
      let valor
      let tx
      try {
        tx = bd.transaction(ALMACEN_AVISOS, modo)
        accion(
          tx.objectStore(ALMACEN_AVISOS),
          (v) => {
            valor = v
          },
        )
      } catch (error) {
        bd.close()
        reject(error)
        return
      }
      tx.oncomplete = () => {
        bd.close()
        resolve(valor)
      }
      tx.onerror = () => {
        bd.close()
        reject(tx.error)
      }
      tx.onabort = () => {
        bd.close()
        reject(tx.error)
      }
    })
  })
}

/** Deja pasar los fallos del almacenamiento: sin lista de avisos, sigue la app. */
async function aSalvo(promesa, porDefecto) {
  try {
    return await promesa
  } catch (error) {
    console.error('[sw] no se pudo usar el almacenamiento de avisos', error)
    return porDefecto
  }
}

/** Un aviso solo cuenta si tiene lo mínimo para mostrarse y una fecha válida. */
function esAvisoValido(item) {
  return Boolean(
    item &&
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      item.id &&
      typeof item.titulo === 'string' &&
      typeof item.cuerpo === 'string' &&
      typeof item.para === 'string' &&
      Number.isFinite(new Date(item.para).getTime()),
  )
}

/** Se guarda solo lo conocido: evita arrastrar campos raros al `structuredClone`. */
function normaliza(item) {
  return {
    id: item.id,
    plantId: typeof item.plantId === 'string' ? item.plantId : '',
    titulo: item.titulo,
    cuerpo: item.cuerpo,
    para: item.para,
  }
}

/** Guarda la lista COMPLETA: lo que no venga, se borra de la lista. */
async function guardarPendientes(items) {
  const lista = items.map(normaliza)
  AVISOS_EN_MEMORIA = lista
  await aSalvo(
    conAlmacen('readwrite', (almacen) => {
      almacen.clear()
      for (const item of lista) almacen.put(item)
    }),
    null,
  )
  return lista
}

/** Lista de avisos pendientes, del más próximo al más lejano. */
async function leerPendientes() {
  const items = await aSalvo(
    conAlmacen('readonly', (almacen, fijar) => {
      const peticion = almacen.getAll()
      peticion.onsuccess = () => fijar(Array.isArray(peticion.result) ? peticion.result : [])
    }),
    null,
  )
  const lista = items ?? AVISOS_EN_MEMORIA
  return lista.sort((a, b) => String(a.para).localeCompare(String(b.para)))
}

/** Un aviso que ya ha saltado (o que ya no vale) sale de la lista. */
async function borrarPendiente(id) {
  AVISOS_EN_MEMORIA = AVISOS_EN_MEMORIA.filter((item) => item.id !== id)
  await aSalvo(
    conAlmacen('readwrite', (almacen) => {
      almacen.delete(id)
    }),
    null,
  )
}

/** Vuelca los temporizadores: primero se limpian los viejos, nunca se duplican. */
function limpiarTemporizadores() {
  for (const t of TEMPORIZADORES.values()) clearTimeout(t)
  TEMPORIZADORES.clear()
}

/** `true` solo si el sistema ha dado el permiso de verdad. */
function permisoConcedido() {
  return Boolean(self.Notification && self.Notification.permission === 'granted')
}

/**
 * Muestra el aviso del sistema y lo saca de la lista, para que no vuelva a
 * sonar en el siguiente rearme.
 */
async function dispara(item) {
  if (!permisoConcedido()) {
    // Sin permiso ya no sonaría nunca: se limpia en vez de arrastrarlo.
    await borrarPendiente(item.id)
    return
  }

  try {
    await self.registration.showNotification(item.titulo, {
      body: item.cuerpo,
      icon: ICONO_AVISO,
      badge: ICONO_AVISO,
      // El tag es el id del aviso: si se repite, sustituye al anterior en lugar
      // de apilar notificaciones iguales.
      tag: item.id,
      renotify: false,
      data: { plantId: item.plantId, avisoId: item.id },
    })
  } catch (error) {
    // Si no se pudo mostrar se deja en la lista: al siguiente rearme se reintenta
    // (puede haber sido un fallo puntual del sistema de notificaciones).
    console.error('[sw] no se pudo mostrar el aviso', item.id, error)
    return
  }

  TEMPORIZADORES.delete(item.id)
  await borrarPendiente(item.id)
}

/**
 * Rearma un `setTimeout` por cada aviso futuro. Se llama en `activate`, en cada
 * mensaje y de vez en cuando al recibir peticiones: es lo que hace que los
 * temporizadores "revivan" cuando Android destruye el worker.
 *
 * Devuelve cuántos avisos quedan REALMENTE armados (sin permiso son 0), que es
 * lo que la app muestra en Ajustes.
 */
async function rearmaAvisos() {
  const pendientes = await leerPendientes()
  limpiarTemporizadores()

  // Sin permiso no se programa nada (pero la lista se conserva: si el usuario
  // vuelve a activar los avisos, el siguiente rearme los recoge).
  if (!permisoConcedido()) return 0

  const ahora = Date.now()
  let armados = 0

  for (const item of pendientes) {
    const cuando = new Date(item.para).getTime()
    const espera = cuando - ahora

    if (espera <= 0) {
      // El worker despertó con el aviso vencido (lo mataron): se muestra ahora
      // si el retraso es razonable, y se tira si es de hace días.
      if (ahora - cuando <= MARGEN_ATRASO_MS) await dispara(item)
      else await borrarPendiente(item.id)
      continue
    }

    // Más lejos de lo que `setTimeout` puede esperar: se rearmará al despertar.
    if (espera > MAX_TIMEOUT_MS) continue

    armados += 1
    TEMPORIZADORES.set(
      item.id,
      setTimeout(() => {
        dispara(item)
      }, espera),
    )
  }

  return armados
}

/** Variante para el `fetch`: no tocar IndexedDB en cada petición de la app. */
async function rearmaSiToca() {
  const ahora = Date.now()
  if (ahora - ULTIMO_REARME < INTERVALO_REARME_MS) return
  ULTIMO_REARME = ahora
  await rearmaAvisos()
}

/** Responde por el canal que la app abrió en `postMessage`. Nunca lanza. */
function responde(puerto, datos) {
  try {
    if (puerto && typeof puerto.postMessage === 'function') puerto.postMessage(datos)
  } catch (error) {
    console.error('[sw] no se pudo responder a la app', error)
  }
}

/** `{ type: 'SINCRONIZAR_AVISOS' }`: deja la lista exactamente como se le manda. */
async function sincronizaAvisos(items, puerto) {
  const lista = Array.isArray(items) ? items.filter(esAvisoValido) : []
  await guardarPendientes(lista)
  const armados = await rearmaAvisos()
  responde(puerto, { type: 'ESTADO_AVISOS', programados: armados })
}

/** `{ type: 'CANCELAR_AVISOS' }`: fuera todos. */
async function cancelaAvisos(puerto) {
  limpiarTemporizadores()
  await guardarPendientes([])
  responde(puerto, { type: 'ESTADO_AVISOS', programados: 0 })
}

/** `{ type: 'PEDIR_ESTADO_AVISOS' }`: de paso rearma lo que se quedó sin temporizador. */
async function respondeEstado(puerto) {
  const armados = await rearmaAvisos()
  responde(puerto, { type: 'ESTADO_AVISOS', programados: armados })
}

/** `{ type: 'PROBAR_AVISO' }`: el botón "enviar aviso de prueba" de Ajustes. */
async function muestraAvisoDePrueba(datos, puerto) {
  if (!permisoConcedido()) {
    responde(puerto, { type: 'AVISO_DE_PRUEBA', ok: false, motivo: 'sin-permiso' })
    return
  }
  try {
    await self.registration.showNotification(datos && datos.titulo ? datos.titulo : 'Plantapps', {
      body: datos && datos.cuerpo ? datos.cuerpo : 'Los avisos de riego funcionan.',
      icon: ICONO_AVISO,
      badge: ICONO_AVISO,
      tag: 'plantapps-prueba',
      data: { prueba: true },
    })
    responde(puerto, { type: 'AVISO_DE_PRUEBA', ok: true })
  } catch (error) {
    console.error('[sw] no se pudo mostrar el aviso de prueba', error)
    responde(puerto, { type: 'AVISO_DE_PRUEBA', ok: false, motivo: 'error' })
  }
}

/** Al tocar el aviso: a la app, que es donde está el historial de la planta. */
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  evento.waitUntil(abreLaApp())
})

async function abreLaApp() {
  try {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const ventana of ventanas) {
      if (ventana.url.startsWith(BASE_ABSOLUTA)) {
        await ventana.focus()
        return
      }
    }
    await self.clients.openWindow(BASE_ABSOLUTA)
  } catch (error) {
    console.error('[sw] no se pudo abrir la app desde el aviso', error)
  }
}

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

  // Avisos: de tanto en tanto se rearman (ver la nota de limitaciones). Va antes
  // de los `return` tempranos porque `waitUntil` es independiente de
  // `respondWith`; con `rearmaSiToca` el throttle hace que no toque nada.
  evento.waitUntil(rearmaSiToca())

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