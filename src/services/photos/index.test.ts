import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryDb } from '@/db/memory'
import { formatearBytes, guardarFoto } from './index'
import { blobDePrueba, instalarEntornoImagen } from './test-utils'
import type { EntornoFalso } from './test-utils'

let entorno: EntornoFalso | null = null

afterEach(() => {
  entorno?.restaurar()
  entorno = null
})

describe('formatearBytes', () => {
  it('formatea bytes, kilobytes, megabytes y gigabytes en español', () => {
    expect(formatearBytes(0)).toBe('0 B')
    expect(formatearBytes(512)).toBe('512 B')
    expect(formatearBytes(1024)).toBe('1 KB')
    expect(formatearBytes(1536)).toBe('1,5 KB')
    expect(formatearBytes(1_048_576)).toBe('1 MB')
    expect(formatearBytes(1_200_000)).toBe('1,1 MB')
    expect(formatearBytes(2_500_000_000)).toBe('2,3 GB')
    expect(formatearBytes(10 * 1024 ** 3)).toBe('10 GB')
  })

  it('no rompe con valores imposibles', () => {
    expect(formatearBytes(-1)).toBe('0 B')
    expect(formatearBytes(Number.NaN)).toBe('0 B')
    expect(formatearBytes(Number.POSITIVE_INFINITY)).toBe('0 B')
  })
})

describe('guardarFoto', () => {
  it('comprime y guarda la foto con sus medidas reales', async () => {
    entorno = instalarEntornoImagen({ ancho: 4000, alto: 3000 })
    const db = createMemoryDb()

    const resultado = await guardarFoto(db, blobDePrueba('image/jpeg'))

    expect(resultado.id).toBeTruthy()
    expect(resultado.width).toBe(1280)
    expect(resultado.height).toBe(960)
    expect(resultado.mime).toBe('image/jpeg')
    expect(resultado.bytes).toBe(resultado.blob.size)
    expect(resultado.creadoEn).toBeTruthy()

    const guardada = await db.photos.get(resultado.id)
    expect(guardada).toBeDefined()
    expect(guardada?.blob.size).toBe(resultado.blob.size)
  })

  it('acepta opciones de compresión', async () => {
    entorno = instalarEntornoImagen({ ancho: 3000, alto: 2000 })
    const db = createMemoryDb()

    const resultado = await guardarFoto(db, blobDePrueba('image/png'), { maxLado: 600, calidad: 0.4 })

    expect(resultado).toMatchObject({ width: 600, height: 400 })
  })

  it('propaga el error si la imagen no se puede procesar', async () => {
    entorno = instalarEntornoImagen({ ancho: 10, alto: 10 })
    const db = createMemoryDb()

    await expect(guardarFoto(db, new Blob([], { type: 'image/jpeg' }))).rejects.toThrow(
      /archivo de imagen está vacío/i,
    )
  })
})