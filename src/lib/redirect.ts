/**
 * REDIRECCIÓN TRAS UN 404
 * =======================
 * GitHub Pages es un servidor de ficheros estáticos: no sabe de rutas, así que
 * si abres un enlace directo como `/Plantapps/planta/abc` en vez de navegar
 * dentro de la app, responde con su página de error y la app no llega a pintar.
 *
 * La solución es la estándar en GitHub Pages: un `404.html` que guarda la ruta
 * pedida y devuelve al inicio, y esta función que la recupera y la pone en la
 * barra de direcciones **antes** de que arranque el enrutador. Así el usuario ve
 * la pantalla correcta desde el primer instante, sin parpadeo.
 */

/** Clave con la URL que el 404 dejó a medias. */
export const CLAVE_REDIRECT = 'plantapps:redirect'

/** Dónde tiene que estar la app. Debe coincidir con `base` de `vite.config.ts`. */
export const BASE_APP = import.meta.env.BASE_URL

/**
 * Normaliza la base para comparar: siempre empieza y acaba por `/`.
 * (`vite` ya devuelve `/Plantapps/`, pero no nos fiamos de nadie.)
 */
function baseNormalizada(base: string): string {
  return `/${base.replace(/^\/+|\/+$/g, '')}/`
}

/**
 * Devuelve la ruta guardada por el 404 y la limpia, o `null` si no sirve.
 *
 * Se rechazan las URLs que no son de esta misma app (ni por origen ni por
 * ruta): el almacenamiento de la sesión es del navegador, pero mejor no fiarse
 * de lo que haya dentro.
 *
 * `base` es un parámetro solo para poder probar los dos casos; en la app se usa
 * la de `vite.config.ts`.
 */
export function recuperarRuta(base: string = BASE_APP): string | null {
  try {
    const guardada = sessionStorage.getItem(CLAVE_REDIRECT)
    if (!guardada) return null
    sessionStorage.removeItem(CLAVE_REDIRECT)

    const url = new URL(guardada, window.location.origin)

    // 1. Solo de nuestro propio origen: nada de mandar al usuario a otro sitio.
    if (url.origin !== window.location.origin) return null

    // 2. Solo rutas de nuestra app. Ojo con prefijos parecidos
    //    (`/Plantapps-engaño/` no cuenta como estar dentro de `/Plantapps/`),
    //    por eso la base se exige con las dos barras.
    const prefijo = baseNormalizada(base)
    if (!url.pathname.startsWith(prefijo)) return null

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

/** Recupera la ruta y la deja como la URL actual. Llámalo antes de pintar. */
export function restaurarRuta(base: string = BASE_APP): void {
  const ruta = recuperarRuta(base)
  if (!ruta) return
  try {
    window.history.replaceState(null, '', ruta)
  } catch {
    // Si el navegador no deja tocar la URL, seguimos en la raíz: mejor eso
    // que dejar al usuario mirando un 404.
  }
}