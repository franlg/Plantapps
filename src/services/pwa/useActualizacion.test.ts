import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TIMEOUT_RECARGA_MS, useActualizacion } from './useActualizacion'

/**
 * Falsos de `navigator.serviceWorker` con lo justo para que el hook funcione:
 * un contenedor que emite `updatefound` y `controllerchange`, y un registro
 * con un worker en estado `installing`.
 */

/** Worker mínimo: se le puede cambiar el estado y avisar a los escuchas. */
function crearWorker(scriptURL = '/plantapps/sw.js') {
  const escuchas = new Map<string, Set<EventListener>>()
  const worker = {
    scriptURL,
    state: 'installing' as ServiceWorkerState,
    addEventListener(tipo: string, fn: EventListener) {
      const set = escuchas.get(tipo) ?? new Set()
      set.add(fn)
      escuchas.set(tipo, set)
    },
    removeEventListener(tipo: string, fn: EventListener) {
      escuchas.get(tipo)?.delete(fn)
    },
    /** Cambia el estado y dispara `statechange`, como hace el navegador. */
    cambiarEstado(estado: ServiceWorkerState) {
      worker.state = estado
      for (const fn of escuchas.get('statechange') ?? []) fn(new Event('statechange'))
    },
  }
  return worker
}

type Contenedor = EventTarget & {
  controller: unknown
  getRegistration: () => Promise<unknown>
}

function montarServiceWorker(opciones: { controller?: unknown; registro?: unknown } = {}): Contenedor {
  const contenedor = new EventTarget() as Contenedor
  contenedor.controller = opciones.controller ?? null
  contenedor.getRegistration = vi.fn().mockResolvedValue(opciones.registro)
  Object.defineProperty(window.navigator, 'serviceWorker', { value: contenedor, configurable: true })
  return contenedor
}

/** jsdom no implementa `location.reload()`: lo sustituimos por un espía. */
function espiarRecarga() {
  const recarga = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { reload: recarga, href: 'https://ejemplo.test/plantapps/' },
    configurable: true,
    writable: true,
  })
  return recarga
}

describe('useActualizacion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('no marca actualización en la primera instalación (aún no hay SW controlando)', async () => {
    const instalando = crearWorker()
    montarServiceWorker({ registro: { installing: instalando, waiting: null } })
    const { result } = renderHook(() => useActualizacion())

    await act(async () => {
      instalando.cambiarEstado('installed')
    })

    expect(result.current.hayActualizacion).toBe(false)
  })

  it('avisa cuando hay un SW controlando y entra uno nuevo ya instalado', async () => {
    const instalando = crearWorker()
    const contenedor = montarServiceWorker({
      controller: { scriptURL: '/plantapps/sw.js' },
      registro: { installing: instalando, waiting: null },
    })
    const { result } = renderHook(() => useActualizacion())

    await act(async () => {
      contenedor.dispatchEvent(new Event('updatefound'))
      instalando.cambiarEstado('installed')
    })

    expect(result.current.hayActualizacion).toBe(true)
  })

  it('no hace nada si el navegador no soporta service workers', () => {
    // @ts-expect-error -- quitamos la propiedad a propósito (jsdom no la trae)
    delete window.navigator.serviceWorker
    espiarRecarga()

    const { result } = renderHook(() => useActualizacion())

    expect(result.current.hayActualizacion).toBe(false)
    expect(() => result.current.actualizar()).not.toThrow()
  })

  it('actualizar() pide SKIP_WAITING y recarga cuando el nuevo SW toma el control', async () => {
    const recarga = espiarRecarga()
    const postMessage = vi.fn()
    const contenedor = montarServiceWorker({
      controller: { scriptURL: '/plantapps/sw.js' },
      registro: { installing: null, waiting: { postMessage } },
    })

    const { result } = renderHook(() => useActualizacion())
    await act(async () => {
      result.current.actualizar()
    })

    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(recarga).not.toHaveBeenCalled()

    await act(async () => {
      contenedor.dispatchEvent(new Event('controllerchange'))
    })
    expect(recarga).toHaveBeenCalledTimes(1)
  })

  it('recarga igualmente si el SW nuevo no llega a controlar la página', async () => {
    const recarga = espiarRecarga()
    montarServiceWorker({ controller: { scriptURL: '/plantapps/sw.js' }, registro: { installing: null, waiting: null } })

    const { result } = renderHook(() => useActualizacion())
    await act(async () => {
      result.current.actualizar()
      await vi.advanceTimersByTimeAsync(TIMEOUT_RECARGA_MS)
    })

    expect(recarga).toHaveBeenCalledTimes(1)
  })
})