import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  calcularDimensiones,
  comprimirImagen,
  elegirMime,
  ERROR_IMAGEN_NO_LEIBLE,
  ERROR_IMAGEN_VACIA,
  ERROR_SIN_CANVAS,
  MAX_LADO_POR_DEFECTO,
  MAX_LADO_THUMB,
} from './compress'
import { blobDePrueba, instalarEntornoImagen } from './test-utils'
import type { EntornoFalso } from './test-utils'

let entorno: EntornoFalso | null = null

afterEach(() => {
  entorno?.restaurar()
  entorno = null
})

/** Los dibujos del 1x1 son la sonda de transparencia previa al render. */
function renders(entorno: EntornoFalso): Array<{ width: number; height: number; fondoPrevio: boolean }> {
  return entorno.dibujos.filter((d) => d.width > 1 || d.height > 1)
}

describe('calcularDimensiones', () => {
  it('reduce una foto vertical manteniendo la proporción', () => {
    expect(calcularDimensiones(3024, 4032, MAX_LADO_POR_DEFECTO)).toEqual({ width: 960, height: 1280 })
  })

  it('reduce una foto horizontal manteniendo la proporción', () => {
    expect(calcularDimensiones(4032, 3024, MAX_LADO_POR_DEFECTO)).toEqual({ width: 1280, height: 960 })
  })

  it('no amplía una imagen que ya cabe', () => {
    expect(calcularDimensiones(800, 600, MAX_LADO_POR_DEFECTO)).toEqual({ width: 800, height: 600 })
  })

  it('deja intacta una imagen justo en el límite', () => {
    expect(calcularDimensiones(1280, 1280, 1280)).toEqual({ width: 1280, height: 1280 })
  })

  it('aguanta una panorámica extrema sin bajar de 1 px', () => {
    expect(calcularDimensiones(10_000, 100, 1280)).toEqual({ width: 1280, height: 13 })
  })

  it('aguanta una vertical extrema sin bajar de 1 px', () => {
    expect(calcularDimensiones(100, 10_000, 1280)).toEqual({ width: 13, height: 1280 })
  })

  it('devuelve 1x1 con valores límite', () => {
    expect(calcularDimensiones(0, 0, 1280)).toEqual({ width: 1, height: 1 })
    expect(calcularDimensiones(-10, -20, 1280)).toEqual({ width: 1, height: 1 })
    expect(calcularDimensiones(5000, 5000, 0)).toEqual({ width: 1, height: 1 })
    expect(calcularDimensiones(Number.NaN, 200, 1280)).toEqual({ width: 1, height: 200 })
  })

  it('nunca deja un lado a cero al reducir mucho', () => {
    expect(calcularDimensiones(1, 5000, 1280)).toEqual({ width: 1, height: 1280 })
  })

  it('devuelve siempre enteros', () => {
    const { width, height } = calcularDimensiones(1000, 333, 400)
    expect(Number.isInteger(width)).toBe(true)
    expect(Number.isInteger(height)).toBe(true)
    expect(Math.max(width, height)).toBeLessThanOrEqual(400)
  })
})

describe('elegirMime', () => {
  it('conserva el PNG solo si tiene transparencia y el canvas soporta alfa', () => {
    expect(elegirMime('image/png', true, true)).toBe('image/png')
    expect(elegirMime('image/png', true, false)).toBe('image/jpeg')
    expect(elegirMime('image/png', false, true)).toBe('image/jpeg')
  })

  it('convierte cualquier otro formato en JPEG', () => {
    expect(elegirMime('image/jpeg', false, false)).toBe('image/jpeg')
    expect(elegirMime('image/heic', true, true)).toBe('image/jpeg')
    expect(elegirMime('', false, false)).toBe('image/jpeg')
  })
})

describe('comprimirImagen', () => {
  it('reduce a 1280 px, genera miniatura de 320 px y libera el bitmap', async () => {
    entorno = instalarEntornoImagen({ ancho: 4000, alto: 3000 })

    const resultado = await comprimirImagen(blobDePrueba('image/jpeg'))

    expect(resultado.width).toBe(1280)
    expect(resultado.height).toBe(960)
    expect(resultado.blob).toBeInstanceOf(Blob)
    expect(resultado.thumb).toBeInstanceOf(Blob)
    expect(entorno.dibujos).toEqual([
      { width: 1280, height: 960, fondoPrevio: true },
      { width: 320, height: 240, fondoPrevio: true },
    ])
    expect(entorno.exportaciones).toEqual([
      { tipo: 'image/jpeg', calidad: 0.82 },
      { tipo: 'image/jpeg', calidad: 0.7 },
    ])
    expect(entorno.cierresDeBitmap()).toBe(1)
  })

  it('acepta maxLado y calidad propios', async () => {
    entorno = instalarEntornoImagen({ ancho: 2000, alto: 2000 })

    const resultado = await comprimirImagen(blobDePrueba('image/jpeg'), { maxLado: 500, calidad: 0.5 })

    expect(resultado).toMatchObject({ width: 500, height: 500 })
    expect(entorno.dibujos[0]).toEqual({ width: 500, height: 500, fondoPrevio: true })
    expect(entorno.exportaciones[0]).toEqual({ tipo: 'image/jpeg', calidad: 0.5 })
  })

  it('devuelve el blob original si la imagen ya es pequeña y solo crea la miniatura', async () => {
    entorno = instalarEntornoImagen({ ancho: 800, alto: 600 })
    const original = blobDePrueba('image/jpeg')

    const resultado = await comprimirImagen(original)

    expect(resultado.blob).toBe(original)
    expect(resultado.width).toBe(800)
    expect(resultado.height).toBe(600)
    expect(entorno.dibujos).toEqual([{ width: MAX_LADO_THUMB, height: 240, fondoPrevio: true }])
    expect(entorno.exportaciones).toHaveLength(1)
    expect(entorno.cierresDeBitmap()).toBe(1)
  })

  it('mantiene el PNG cuando la imagen tiene transparencia', async () => {
    entorno = instalarEntornoImagen({ ancho: 2000, alto: 1000, alfa: 0 })

    const resultado = await comprimirImagen(blobDePrueba('image/png'))

    expect(resultado.blob.type).toBe('image/png')
    expect(resultado.thumb.type).toBe('image/png')
    expect(renders(entorno)).toEqual([
      { width: 1280, height: 640, fondoPrevio: false },
      { width: 320, height: 160, fondoPrevio: false },
    ])
  })

  it('convierte a JPEG un PNG sin transparencia', async () => {
    entorno = instalarEntornoImagen({ ancho: 2000, alto: 1000, alfa: 255 })

    const resultado = await comprimirImagen(blobDePrueba('image/png'))

    expect(resultado.blob.type).toBe('image/jpeg')
    expect(renders(entorno)[0]?.fondoPrevio).toBe(true)
  })

  it('degrada a JPEG si el canvas no puede con el canal alfa', async () => {
    entorno = instalarEntornoImagen({ ancho: 2000, alto: 1000, alfa: 0, sinAlfa: true })

    const resultado = await comprimirImagen(blobDePrueba('image/png'))

    expect(resultado.blob.type).toBe('image/jpeg')
  })

  it('degrada a JPEG sin fallar cuando el canvas no sabe exportar PNG', async () => {
    entorno = instalarEntornoImagen({ ancho: 2000, alto: 1000, alfa: 0, fallarCon: 'image/png' })

    const resultado = await comprimirImagen(blobDePrueba('image/png'))

    expect(resultado.blob.type).toBe('image/jpeg')
    expect(resultado.thumb.type).toBe('image/jpeg')
    expect(entorno.exportaciones.map((e) => e.tipo)).toEqual([
      'image/png',
      'image/jpeg',
      'image/png',
      'image/jpeg',
    ])
  })

  it('usa <img> + objectURL cuando no existe createImageBitmap', async () => {
    entorno = instalarEntornoImagen({ ancho: 1600, alto: 1600, sinBitmap: true })

    const resultado = await comprimirImagen(blobDePrueba('image/jpeg'))

    expect(resultado).toMatchObject({ width: 1280, height: 1280 })
    expect(entorno.dibujos).toHaveLength(2)
    expect(entorno.cierresDeBitmap()).toBe(0)
    expect(entorno.objectUrlsRevocadas).toHaveLength(1)
  })

  it('se queda con <img> si createImageBitmap falla', async () => {
    entorno = instalarEntornoImagen({ ancho: 300, alto: 200, bitmapConError: true })

    const resultado = await comprimirImagen(blobDePrueba('image/jpeg'))

    expect(resultado.blob.type).toBe('image/jpeg')
    expect(entorno.objectUrlsRevocadas).toHaveLength(1)
  })

  it('avisa en español cuando la imagen no se puede decodificar', async () => {
    entorno = instalarEntornoImagen({ ancho: 100, alto: 100, sinBitmap: true, imagenConError: true })

    await expect(comprimirImagen(blobDePrueba('image/jpeg'))).rejects.toThrow(ERROR_IMAGEN_NO_LEIBLE)
    await expect(comprimirImagen(blobDePrueba('image/jpeg'))).rejects.toThrow(/no se ha podido abrir la imagen/i)
  })

  it('rechaza un archivo vacío', async () => {
    entorno = instalarEntornoImagen({ ancho: 10, alto: 10 })
    await expect(comprimirImagen(new Blob([], { type: 'image/jpeg' }))).rejects.toThrow(
      ERROR_IMAGEN_VACIA,
    )
  })

  it('avisa si el navegador no da contexto 2D', async () => {
    entorno = instalarEntornoImagen({ ancho: 1000, alto: 1000 })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    await expect(comprimirImagen(blobDePrueba('image/jpeg'))).rejects.toThrow(ERROR_SIN_CANVAS)
  })
})