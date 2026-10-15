import { describe, expect, it, beforeEach } from 'vitest'
import { CLAVE_REDIRECT, recuperarRuta, restaurarRuta } from './redirect'

/** La app real está en `/Plantapps/`; en los tests se pasa a mano. */
const BASE = '/Plantapps/'
const ORIGEN = window.location.origin

/** El 404.html deja aquí la URL que el usuario había pedido. */
function dejarRedirect(url: string): void {
  sessionStorage.setItem(CLAVE_REDIRECT, url)
}

describe('redirección tras el 404 de GitHub Pages', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('no hace nada si no hay nada guardado', () => {
    expect(recuperarRuta(BASE)).toBeNull()
  })

  it('recupera la ruta que dejó el 404 y limpia el almacenamiento', () => {
    dejarRedirect(`${ORIGEN}${BASE}planta/abc-123`)

    expect(recuperarRuta(BASE)).toBe(`${BASE}planta/abc-123`)
    // Solo una vez: si se leyera dos veces, la segunda daría null.
    expect(recuperarRuta(BASE)).toBeNull()
  })

  it('conserva los parámetros y el ancla de la URL', () => {
    dejarRedirect(`${ORIGEN}${BASE}ajustes?x=1#seccion`)

    expect(recuperarRuta(BASE)).toBe(`${BASE}ajustes?x=1#seccion`)
  })

  it('acepta la raíz de la app', () => {
    dejarRedirect(`${ORIGEN}${BASE}`)

    expect(recuperarRuta(BASE)).toBe(BASE)
  })

  it('ignora una URL de otro sitio: no manda al usuario fuera', () => {
    dejarRedirect('https://otro-sitio.example/planta/abc')

    expect(recuperarRuta(BASE)).toBeNull()
  })

  it('ignora una ruta que se parece pero se sale de la base', () => {
    // Un prefijo parecido (`/Plantapps-engaño/`) no cuenta como estar dentro.
    dejarRedirect(`${ORIGEN}/Plantapps-engaño/planta/abc`)

    expect(recuperarRuta(BASE)).toBeNull()
  })

  it('restaurarRuta deja la URL correcta sin recargar la página', () => {
    dejarRedirect(`${ORIGEN}${BASE}planta/abc-123`)
    window.history.replaceState(null, '', BASE)

    restaurarRuta(BASE)

    expect(window.location.pathname).toBe(`${BASE}planta/abc-123`)
  })

  it('si no hay nada guardado no toca la URL', () => {
    window.history.replaceState(null, '', `${BASE}ajustes`)

    restaurarRuta(BASE)

    expect(window.location.pathname).toBe(`${BASE}ajustes`)
  })

  it('funciona aunque la base venga sin barras', () => {
    dejarRedirect(`${ORIGEN}/Plantapps/planta/abc`)

    expect(recuperarRuta('Plantapps')).toBe(`${BASE}planta/abc`)
  })
})