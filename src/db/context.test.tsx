import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DbProvider, useFotosProgreso } from './context'
import { createMemoryDb } from './memory'
import type { Db } from '@/services/contracts'
import type { AiAnalysisDraft } from '@/types'

/** Monta un hook contra una base en memoria nueva para cada test. */
function montar(plantId?: string) {
  return montarEn(createMemoryDb(), plantId)
}

/** Monta un hook contra la base que le pases, ya preparada. */
function montarEn(db: Db, plantId?: string) {
  const envoltura = ({ children }: { children: ReactNode }) => (
    <DbProvider db={db}>{children}</DbProvider>
  )
  return { db, vista: renderHook(() => useFotosProgreso(plantId), { wrapper: envoltura }) }
}

const BORRADOR: AiAnalysisDraft = {
  veredicto: 'todo_ok',
  salud: 88,
  accionPrincipal: 'Déjala tranquila',
  regar: false,
  frecuenciaRiegoDias: 8,
  sintomas: [],
  recomendaciones: [],
  confianza: 'alta',
  resumen: 'La planta está bien.',
}

describe('useFotosProgreso', () => {
  it('devuelve vacío si no hay planta', async () => {
    const { vista } = montar()
    await waitFor(() => expect(vista.result.current).toEqual([]))
  })

  it('devuelve vacío si la planta no tiene ninguna foto', async () => {
    const { db, vista } = montar()
    await db.plants.create({ nombre: 'Sin foto' })
    vista.rerender()
    await waitFor(() => expect(vista.result.current).toEqual([]))
  })

  it('devuelve la portada aunque la planta no tenga ningún análisis', async () => {
    // Regresión: antes solo se pedían las fotos de los análisis, así que una
    // planta recién creada con foto salía con la galería vacía.
    const db = createMemoryDb()
    const planta = await db.plants.create({ nombre: 'Recién comprada' })
    const foto = await db.photos.put(new Blob(['portada'], { type: 'image/jpeg' }))
    await db.plants.setFotoPortada(planta.id, foto.id)

    const { vista } = montarEn(db, planta.id)
    await waitFor(() => expect(vista.result.current).toHaveLength(1))
    expect(vista.result.current[0]).toMatchObject({ id: foto.id, origen: 'portada' })
  })

  it('devuelve una foto por análisis, de más reciente a más antigua', async () => {
    const db = createMemoryDb()
    const planta = await db.plants.create({ nombre: 'Con historial' })
    const fotos = [] as Array<{ id: string }>
    for (let i = 0; i < 3; i++) {
      const foto = await db.photos.put(new Blob([`f${i}`], { type: 'image/jpeg' }))
      fotos.push(foto)
      await db.analyses.create({ ...BORRADOR, plantId: planta.id, photoId: foto.id, modelo: 'm' })
    }

    const { vista } = montarEn(db, planta.id)
    await waitFor(() => expect(vista.result.current).toHaveLength(3))

    const fechas = vista.result.current.map((f) => f.fecha)
    expect([...fechas].sort((a, b) => b.localeCompare(a))).toEqual(fechas)
    expect(vista.result.current.every((f) => f.origen === 'analisis')).toBe(true)
  })

  it('no repite la portada cuando ya sale de un análisis', async () => {
    // Regresión: si la portada era la foto de un análisis antiguo, salía dos
    // veces en la galería.
    const db = createMemoryDb()
    const planta = await db.plants.create({ nombre: 'Portada repetida' })
    const antigua = await db.photos.put(new Blob(['antigua'], { type: 'image/jpeg' }))
    const reciente = await db.photos.put(new Blob(['reciente'], { type: 'image/jpeg' }))

    await db.analyses.create({ ...BORRADOR, plantId: planta.id, photoId: antigua.id, modelo: 'm' })
    await db.analyses.create({ ...BORRADOR, plantId: planta.id, photoId: reciente.id, modelo: 'm' })
    await db.plants.setFotoPortada(planta.id, antigua.id)

    const { vista } = montarEn(db, planta.id)
    await waitFor(() => expect(vista.result.current).toHaveLength(2))

    const ids = vista.result.current.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('omite la foto de un análisis si ya no existe en la base', async () => {
    const db = createMemoryDb()
    const planta = await db.plants.create({ nombre: 'Foto borrada' })
    const buena = await db.photos.put(new Blob(['buena'], { type: 'image/jpeg' }))
    const borrada = await db.photos.put(new Blob(['borrada'], { type: 'image/jpeg' }))

    await db.analyses.create({ ...BORRADOR, plantId: planta.id, photoId: buena.id, modelo: 'm' })
    await db.analyses.create({ ...BORRADOR, plantId: planta.id, photoId: borrada.id, modelo: 'm' })
    await db.photos.remove(borrada.id)

    const { vista } = montarEn(db, planta.id)
    await waitFor(() => expect(vista.result.current).toHaveLength(1))
    expect(vista.result.current[0]?.id).toBe(buena.id)
  })

  it('trae el veredicto de cada análisis, para poder marcar cómo estaba', async () => {
    const db = createMemoryDb()
    const planta = await db.plants.create({ nombre: 'Con veredictos' })
    const foto = await db.photos.put(new Blob(['x'], { type: 'image/jpeg' }))
    await db.analyses.create({
      ...BORRADOR,
      veredicto: 'regar',
      plantId: planta.id,
      photoId: foto.id,
      modelo: 'm',
    })

    const { vista } = montarEn(db, planta.id)
    await waitFor(() => expect(vista.result.current).toHaveLength(1))
    expect(vista.result.current[0]?.veredicto).toBe('regar')
  })
})