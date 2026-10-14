/**
 * AVISO DE ACTUALIZACIÓN
 * ======================
 * Cuando publicamos una versión nueva, el service worker nuevo se queda
 * esperando (`waiting`) para no romper la sesión actual. Este hook avisa a la
 * interfaz (`hayActualizacion`) y, cuando el usuario pide actualizar, activa
 * el service worker nuevo y recarga la página.
 *
 * Uso típico:
 *     const { hayActualizacion, actualizar } = useActualizacion()
 */

import { useCallback, useEffect, useState } from 'react'

/**
 * Margen (ms) para recargar si el service worker nuevo no toma el control.
 * Nunca debería pasar (el `activate` va casi siempre por delante), pero un
 * móvil con la pestaña en segundo plano puede tardar: mejor recargar de más
 * que dejar al usuario en la versión vieja.
 */
export const TIMEOUT_RECARGA_MS = 1500

export interface EstadoActualizacion {
  /** Hay una versión nueva instalada y esperando a que el usuario la active. */
  hayActualizacion: boolean
  /** Activa la versión nueva y recarga. */
  actualizar: () => void
}

/** `navigator.serviceWorker` o `null` si el navegador no lo soporta. */
export function contenedorServiceWorker(): ServiceWorkerContainer | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  return navigator.serviceWorker
}

/**
 * Observa si hay una versión nueva del service worker lista para activarse.
 * Devuelve también la función para activarla.
 */
export function useActualizacion(): EstadoActualizacion {
  const [hayActualizacion, setHayActualizacion] = useState(false)

  useEffect(() => {
    const contenedor = contenedorServiceWorker()
    if (contenedor === null) return
    let vivo = true

    const observar = (instalando: ServiceWorker | null | undefined) => {
      if (!instalando) return
      const alCambiarEstado = () => {
        // `installed` + ya hay un SW controlando = hay actualización pendiente.
        // Si no hay ninguno controlando, es la primera instalación: no hay nada
        // que ofrecerle al usuario.
        if (vivo && instalando.state === 'installed' && contenedor.controller) {
          setHayActualizacion(true)
        }
      }
      instalando.addEventListener('statechange', alCambiarEstado)
      alCambiarEstado()
    }

    const registrarObservacion = () => {
      contenedor.getRegistration().then(
        (registro) => {
          if (vivo) observar(registro?.installing)
        },
        () => {
          // Sin registro no hay nada que observar.
        },
      )
    }

    // `updatefound` salta en el contenedor cuando el navegador descarga un SW
    // nuevo. Además miramos el estado actual por si ya se había descargado
    // antes de montar este hook.
    contenedor.addEventListener('updatefound', registrarObservacion)
    registrarObservacion()

    return () => {
      vivo = false
      contenedor.removeEventListener('updatefound', registrarObservacion)
    }
  }, [])

  const actualizar = useCallback(() => {
    const contenedor = contenedorServiceWorker()
    // Sin service worker (navegador antiguo) solo queda recargar.
    if (contenedor === null) {
      window.location.reload()
      return
    }

    let temporizador = 0
    function recargar() {
      window.clearTimeout(temporizador)
      window.location.reload()
    }

    temporizador = window.setTimeout(() => {
      contenedor.removeEventListener('controllerchange', recargar)
      window.location.reload()
    }, TIMEOUT_RECARGA_MS)

    // Cuando el SW nuevo se activa, la página pasa a estar controlada por él:
    // ese es el momento seguro de recargar.
    contenedor.addEventListener('controllerchange', recargar, { once: true })

    contenedor.getRegistration().then(
      (registro) => {
        registro?.waiting?.postMessage({ type: 'SKIP_WAITING' })
      },
      () => {
        // Si no hay registro, el temporizador de arriba recarga igualmente.
      },
    )
  }, [])

  return { hayActualizacion, actualizar }
}