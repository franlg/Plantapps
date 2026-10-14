import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useOnline } from './offline'

/**
 * En jsdom `navigator.onLine` es siempre `true`, así que lo redefinimos con
 * `defineProperty` (sí es configurable) para poder simular la red.
 */
function ponerOnline(valor: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { value: valor, configurable: true })
}

describe('useOnline', () => {
  afterEach(() => {
    ponerOnline(true)
  })

  it('devuelve el valor inicial de navigator.onLine', () => {
    ponerOnline(true)
    expect(renderHook(() => useOnline()).result.current).toBe(true)

    ponerOnline(false)
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(false)
  })

  it('se pone a false al recibir el evento offline y a true con online', () => {
    ponerOnline(true)
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)

    act(() => {
      ponerOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      ponerOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it('sigue la conexión real si el estado cambia sin evento antes de montar', () => {
    ponerOnline(false)
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(false)

    act(() => {
      ponerOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it('deja de escuchar al desmontarse', () => {
    ponerOnline(true)
    const { result, unmount } = renderHook(() => useOnline())
    unmount()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(true)
  })
})