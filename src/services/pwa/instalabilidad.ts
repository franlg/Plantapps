/**
 * INSTALABILIDAD DE LA PWA
 * ========================
 * En Android/Chrome, cuando la app cumple los requisitos (manifest, service
 * worker, iconos) el navegador lanza `beforeinstallprompt`: un evento que nos
 * deja abrir la ventana de instalación nosotros ("Añadir a pantalla de
 * inicio"). Ese evento NO está en las tipografías de TypeScript, así que aquí
 * declaramos su forma exacta.
 *
 * Importante: `beforeinstallprompt` solo se lanza UNA VEZ, y solo si el
 * usuario no lo descarta antes. Por eso guardamos el evento en una variable de
 * módulo: si lo metiéramos en un `useState` desde dentro del evento, cualquier
 * remonte del componente lo perdería.
 *
 * Uso típico:
 *     const { instalable, prompt, instalado } = useInstalable()
 */

import { useCallback, useEffect, useState } from 'react'

/** Elección del usuario en el diálogo de instalación. */
export interface EleccionInstalacion {
  readonly outcome: 'accepted' | 'dismissed'
  readonly platform: string
}

/**
 * Evento `beforeinstallprompt` (Android/Chrome). No viene en `lib.dom.d.ts`,
 * así que lo declaramos aquí para poder tratarlo sin `any`.
 */
export interface EventoBeforeInstallPrompt extends Event {
  readonly platforms: readonly string[]
  readonly userChoice: Promise<EleccionInstalacion>
  prompt(): Promise<void>
}

/** `window` con el evento guardado por el módulo. */
interface VentanaConInstall extends Window {
  __plantappsEventoInstall?: EventoBeforeInstallPrompt | null
}

function eventoGuardado(): EventoBeforeInstallPrompt | null {
  if (typeof window === 'undefined') return null
  return (window as VentanaConInstall).__plantappsEventoInstall ?? null
}

function guardarEvento(evento: EventoBeforeInstallPrompt | null): void {
  if (typeof window === 'undefined') return
  const ventana = window as VentanaConInstall
  ventana.__plantappsEventoInstall = evento
}

/**
 * ¿Está la app ya instalada (abierta desde su icono, sin barra del navegador)?
 * Se comprueba con `display-mode: standalone`, que es el estándar;
 * `navigator.standalone` es el equivalente antiguo de iOS.
 */
export function detectarInstalada(): boolean {
  if (typeof window === 'undefined') return false
  const enVentana = window.matchMedia?.('(display-mode: standalone)')?.matches === true
  const enIOS = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return enVentana || enIOS
}

/**
 * ¿Se puede mostrar ahora el botón de instalar? Solo si el navegador nos ha
 * dado el evento `beforeinstallprompt` y la app no está ya instalada.
 */
export function puedeInstalarse(): boolean {
  return eventoGuardado() !== null && !detectarInstalada()
}

export interface EstadoInstalable {
  /** El navegador permite instalar la app: hay que ofrecerle el botón. */
  instalable: boolean
  /** Abre el diálogo de instalación del sistema. Nunca lanza. */
  prompt: () => Promise<void>
  /** La app ya está instalada: no hay que ofrecer nada. */
  instalado: boolean
}

/**
 * Estado de instalación de la PWA.
 *
 * @example
 * const { instalable, prompt } = useInstalable()
 * return instalable ? <button onClick={() => void prompt()}>Instalar</button> : null
 */
export function useInstalable(): EstadoInstalable {
  const [instalable, setInstalable] = useState(() => puedeInstalarse())
  const [instalado, setInstalado] = useState(detectarInstalada)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const alPrompt = (evento: Event) => {
      // Sin preventDefault, Chrome enseña su propia barra inferior de instalación.
      evento.preventDefault()
      guardarEvento(evento as EventoBeforeInstallPrompt)
      setInstalable(!detectarInstalada())
    }
    const alInstalar = () => {
      guardarEvento(null)
      setInstalable(false)
      setInstalado(true)
    }
    const alCambiarDisplay = (evento: MediaQueryListEvent) => {
      if (evento.matches) alInstalar()
    }

    window.addEventListener('beforeinstallprompt', alPrompt)
    window.addEventListener('appinstalled', alInstalar)
    const consulta = window.matchMedia?.('(display-mode: standalone)')
    consulta?.addEventListener('change', alCambiarDisplay)
    // El evento pudo dispararse antes de que este hook se montara.
    setInstalable(puedeInstalarse())

    return () => {
      window.removeEventListener('beforeinstallprompt', alPrompt)
      window.removeEventListener('appinstalled', alInstalar)
      consulta?.removeEventListener('change', alCambiarDisplay)
    }
  }, [])

  const prompt = useCallback(async () => {
    const evento = eventoGuardado()
    if (!evento) return
    try {
      await evento.prompt()
      const eleccion = await evento.userChoice
      // El evento solo sirve una vez: si el usuario lo rechaza no volveremos a
      // recibir otro, así que lo olvidamos.
      if (eleccion.outcome !== 'accepted') guardarEvento(null)
      setInstalable(false)
      setInstalado(detectarInstalada())
    } catch {
      // El navegador puede cerrar el diálogo sin dar la elección: no es un error.
    }
  }, [])

  return { instalable: instalable && !instalado, prompt, instalado }
}