/**
 * AVISOS DE RIEGO DEL SISTEMA
 * ============================
 * Programa avisos **del sistema** (notificación de Android) para cuando toca
 * regar. La app ya avisa dentro de la pantalla "Requieren atención"; esto es el
 * complemento de "suena aunque no estés mirando la app".
 *
 * TODO AQUÍ ES MEJOR ESFUERZO, NO GARANTÍA. Una PWA no puede pedirle al sistema
 * una alarma persistente (eso es de las apps nativas) y Android puede cerrar el
 * service worker en cualquier momento; si lo hace, el temporizador que tenía
 * armado el aviso se pierde. Lo que sí se hace es rearmarlos en cuanto Android
 * vuelve a despertar al worker (al activar, con cada mensaje y cada cierto
 * tiempo en cada petición). Esa limitación se le dice al usuario, no se esconde:
 * `AVISO_LIMITACION` es el texto que la interfaz muestra en Ajustes.
 *
 * Regla de hierro de este módulo: **nada rompe la app**. Si no hay
 * notificaciones, si no hay permiso, si el navegador no tiene service worker o
 * si algo falla por el camino, se devuelven valores por defecto y listo. La
 * única excepción es `probar()`, que es una acción explícita del usuario y por
 * eso sí lanza un `Error` con un mensaje que pueda hacer algo con él.
 */

import type {
  EstadoPlanificador,
  PermisoNotificaciones,
  RecordatorioProgramado,
  RecordatorioScheduler,
} from '@/types'
import { obtenerServiceWorker } from '@/services/pwa/registro'

export { calcularAvisos } from './programar'

/** Mensajes que entiende el service worker (ver `public/sw.js`). */
const SINCRONIZAR = 'SINCRONIZAR_AVISOS'
const CANCELAR = 'CANCELAR_AVISOS'
const PEDIR_ESTADO = 'PEDIR_ESTADO_AVISOS'
const PROBAR = 'PROBAR_AVISO'

/**
 * Cuánto se espera al service worker antes de renunciar y seguir sin él.
 * Corto a propósito: si el worker no contesta, la app no puede quedarse
 * esperando (y en Ajustes el usuario está mirando un botón).
 */
const TIMEOUT_MS = 1500

/** Explicación honesta de la limitación, reutilizable en la interfaz. */
export const AVISO_LIMITACION =
  'Android puede cerrar la app en segundo plano y entonces el aviso no llegará a tiempo. Dentro de la app siempre te avisamos en "Requieren atención"; para que también suene fuera, deja la app instalada y ábrela de vez en cuando para que el sistema pueda rearmar los avisos.'

/** Aviso para cuando el permiso está bloqueado: lo que puede hacer el usuario. */
export const AVISO_BLOQUEADO =
  'Has bloqueado las notificaciones de Plantapps. Puedes activarlas en los ajustes del navegador (en Android, el candado o los tres puntitos junto a la dirección de la web).'

/** Aviso para navegadores sin API de notificaciones. */
export const AVISO_NO_SOPORTADO = 'Este navegador no admite notificaciones, así que los avisos solo saldrán dentro de la app.'

/** Sin soporte de notificaciones: no romper nunca la app por esto. */
const SIN_NOTIFICACIONES: EstadoPlanificador = {
  permiso: 'no-soportado',
  programados: 0,
  persistentes: false,
  aviso: AVISO_NO_SOPORTADO,
}

/** El constructor `Notification` si este navegador lo tiene; `null` si no. */
function apiNotificaciones(): typeof Notification | null {
  if (typeof window === 'undefined') return null
  return typeof window.Notification === 'function' ? window.Notification : null
}

/** `true` si hay un service worker con el que poder hablar. */
function tieneServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/** El permiso actual, leído sin lanzar: `'no-soportado'` si no hay API. */
function leerPermiso(): PermisoNotificaciones {
  const api = apiNotificaciones()
  if (!api) return 'no-soportado'
  try {
    const permiso = api.permission
    if (permiso === 'granted' || permiso === 'denied' || permiso === 'default') return permiso
    return 'default'
  } catch {
    // Algún navegador lanza al leer `permission` en contextos raros.
    return 'denied'
  }
}

/** Ruta del icono de los avisos, resuelta con el `base` del proyecto. */
function icono(): string {
  return `${import.meta.env.BASE_URL}icons/icon-192.png`
}

/**
 * Le manda un mensaje al service worker y espera su respuesta por un canal.
 *
 * Devuelve los datos que conteste el worker o `null` si no hay service worker,
 * si `postMessage` falla o si el worker no contesta a tiempo. Nunca lanza y
 * nunca se queda esperando para siempre: es la función que garantiza que la
 * interfaz pueda pintar lo que sea sin un `try/catch` alrededor.
 */
function enviar(sw: ServiceWorker, mensaje: object, timeoutMs: number): Promise<unknown | null> {
  return new Promise((resolve) => {
    let canal: MessageChannel
    try {
      canal = new MessageChannel()
    } catch {
      resolve(null)
      return
    }

    let reloj: ReturnType<typeof setTimeout> | undefined
    let resuelto = false
    const terminar = (valor: unknown | null): void => {
      if (resuelto) return
      resuelto = true
      if (reloj !== undefined) clearTimeout(reloj)
      try {
        canal.port1.close()
      } catch {
        /* el canal ya estaba cerrado */
      }
      resolve(valor)
    }

    reloj = setTimeout(() => terminar(null), timeoutMs)
    canal.port1.onmessage = (evento: MessageEvent) => terminar(evento.data ?? null)
    canal.port1.start()

    try {
      sw.postMessage(mensaje, [canal.port2])
    } catch {
      // `postMessage` puede fallar si el worker murió justo entre medias.
      terminar(null)
    }
  })
}

/** `{ programados: N }` si eso es lo que ha contestado el worker. */
function programadosDe(respuesta: unknown): number | null {
  if (typeof respuesta !== 'object' || respuesta === null) return null
  const datos = respuesta as { type?: unknown; programados?: unknown }
  if (datos.type !== 'ESTADO_AVISOS') return null
  const valor = datos.programados
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) return null
  return Math.trunc(valor)
}

/** Un aviso solo se programa si tiene texto y una fecha futura de verdad. */
function esProgramable(item: RecordatorioProgramado, ahora: number): boolean {
  if (typeof item.id !== 'string' || !item.id) return false
  if (typeof item.titulo !== 'string' || typeof item.cuerpo !== 'string') return false
  const cuando = new Date(item.para).getTime()
  return Number.isFinite(cuando) && cuando > ahora
}

/** Ajustes internos del planificador (solo tests los cambian). */
export interface OpcionesPlanificador {
  /** Cuánto esperar al service worker antes de seguir sin él. */
  timeoutMs?: number
  /** Service worker concreto. Por defecto se busca el que esté activo. */
  buscarServiceWorker?: (timeoutMs: number) => Promise<ServiceWorker | null>
}

/**
 * Crea un planificador de avisos.
 *
 * Cada llamada devuelve una instancia nueva e independiente: así los tests
 * pueden tener las suyas sin pisarse y cada una usa su propio reloj de espera.
 */
export function createRecordatorioScheduler(opciones: OpcionesPlanificador = {}): RecordatorioScheduler {
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS
  const buscar = opciones.buscarServiceWorker ?? obtenerServiceWorker

  return {
    /** Estado actual: permiso, cuántos avisos hay y hasta dónde llegan. */
    async estado(): Promise<EstadoPlanificador> {
      const permiso = leerPermiso()
      const persistentes = tieneServiceWorker()

      if (permiso === 'no-soportado') {
        return { ...SIN_NOTIFICACIONES, persistentes }
      }

      let programados = 0
      const sw = await buscar(timeoutMs)
      if (sw) {
        programados = programadosDe(await enviar(sw, { type: PEDIR_ESTADO }, timeoutMs)) ?? 0
      }

      return {
        permiso,
        programados,
        persistentes,
        aviso: permiso === 'denied' ? AVISO_BLOQUEADO : AVISO_LIMITACION,
      }
    },

    /**
     * Pide el permiso. Nunca lanza: como mucho devuelve `'denied'` cuando el
     * navegador ni siquiera deja preguntar.
     */
    async pedirPermiso(): Promise<PermisoNotificaciones> {
      const api = apiNotificaciones()
      if (!api) return 'no-soportado'
      try {
        const permiso = await api.requestPermission()
        return permiso === 'granted' || permiso === 'denied' || permiso === 'default' ? permiso : 'denied'
      } catch {
        // En algunos navegadores `requestPermission()` lanza si no hay un toque
        // del usuario detrás, y en modo privado no hace nada.
        return 'denied'
      }
    },

    /**
     * Programa la lista completa de avisos. Lo que no esté en ella se cancela,
     * así que quien llama tiene que pasar siempre `calcularAvisos(...)`.
     */
    async sincronizar(items: RecordatorioProgramado[]): Promise<number> {
      // Sin permiso no hay nada que programar, y sin worker tampoco.
      if (leerPermiso() !== 'granted') return 0

      const ahora = Date.now()
      const lista = items
        .filter((item) => esProgramable(item, ahora))
        .sort((a, b) => a.para.localeCompare(b.para) || a.plantId.localeCompare(b.plantId))

      const sw = await buscar(timeoutMs)
      if (!sw) return 0

      const respuesta = await enviar(sw, { type: SINCRONIZAR, items: lista }, timeoutMs)
      // Si el worker no contesta (o es una versión antigua que no conoce este
      // mensaje) se devuelve lo enviado como mejor estimación.
      return programadosDe(respuesta) ?? lista.length
    },

    /** Cancela todos los avisos, incluidos los que ya no apliquen. */
    async cancelarTodos(): Promise<void> {
      const sw = await buscar(timeoutMs)
      if (!sw) return
      await enviar(sw, { type: CANCELAR }, timeoutMs)
    },

    /**
     * Lanza un aviso de prueba para comprobar que las notificaciones suenan.
     *
     * Este es el único método que lanza, y solo para poder darle al usuario un
     * mensaje accionable ("actívalas y vuelve a intentarlo").
     */
    async probar(): Promise<void> {
      const api = apiNotificaciones()
      if (!api) {
        throw new Error('Este navegador no admite notificaciones: los avisos solo saldrán dentro de la app.')
      }

      const permiso = leerPermiso()
      if (permiso === 'denied') {
        throw new Error(
          'Las notificaciones están bloqueadas para Plantapps. Actívalas en los ajustes del navegador (en Android, el candado junto a la dirección) y vuelve a intentarlo.',
        )
      }
      if (permiso !== 'granted') {
        throw new Error('Primero hay que activar las notificaciones; después podrás comprobar que suenan con este botón.')
      }

      const titulo = 'Plantapps: aviso de prueba'
      const cuerpo = 'Así te avisaré cuando toque regar. Puedes cerrar este aviso.'
      const opciones: NotificationOptions = { body: cuerpo, icon: icono(), tag: 'plantapps-prueba' }

      // Preferimos el service worker: en varios navegadores es el único que
      // tiene permiso para mostrar una notificación desde una PWA instalada.
      const sw = await buscar(timeoutMs)
      if (sw) {
        const respuesta = await enviar(sw, { type: PROBAR, titulo, cuerpo }, timeoutMs)
        if (typeof respuesta === 'object' && respuesta !== null) {
          const ok = (respuesta as { ok?: unknown }).ok
          if (ok === false) {
            throw new Error('No se ha podido mostrar el aviso de prueba. Cierra y vuelve a abrir la app e inténtalo otra vez.')
          }
          return
        }
      }

      try {
        new api(titulo, opciones)
      } catch {
        throw new Error('No se ha podido mostrar el aviso de prueba. Prueba a abrir la app desde su icono y repetir.')
      }
    },
  }
}

/**
 * Planificador de avisos que usa la app.
 *
 * Es el mismo que se puede pedir con `createRecordatorioScheduler()`, listo para
 * usar desde cualquier sitio.
 */
export const recordatorioScheduler: RecordatorioScheduler = createRecordatorioScheduler()