import { describe, expect, it } from 'vitest'
import { createMemoryDb } from './memory'
import { nowIso } from '@/lib/dates'

const haceDias = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()

describe('Db en memoria (cumplimiento del contrato)', () => {
  it('crea una planta y la lista sin duplicarla', async () => {
    const db = createMemoryDb()
    const plant = await db.plants.create({ nombre: 'Monstera' })

    expect(plant.nombre).toBe('Monstera')
    expect(plant.archivada).toBe(false)
    expect(plant.creadoEn).toBeTruthy()

    const lista = await db.plants.list()
    expect(lista).toHaveLength(1)
    expect(lista[0]?.id).toBe(plant.id)
  })

  it('ordena las plantas alfabéticamente en español', async () => {
    const db = createMemoryDb()
    await db.plants.create({ nombre: 'Áloe' })
    await db.plants.create({ nombre: 'Bambú' })
    await db.plants.create({ nombre: 'Árbol' })

    expect((await db.plants.list()).map((p) => p.nombre)).toEqual(['Áloe', 'Árbol', 'Bambú'])
  })

  it('actualiza una planta y marca actualizadoEn', async () => {
    const db = createMemoryDb()
    const plant = await db.plants.create({ nombre: 'Ficus' })

    const updated = await db.plants.update(plant.id, { especie: 'Ficus elastica' })

    expect(updated.especie).toBe('Ficus elastica')
    expect(updated.creadoEn).toBe(plant.creadoEn)
    expect(Date.parse(updated.actualizadoEn)).toBeGreaterThanOrEqual(Date.parse(plant.actualizadoEn))
  })

  it('oculta las plantas archivadas salvo que se pidan', async () => {
    const db = createMemoryDb()
    const plant = await db.plants.create({ nombre: 'Cactus' })
    await db.plants.setArchivada(plant.id, true)

    expect(await db.plants.list()).toHaveLength(0)
    expect(await db.plants.list({ incluirArchivadas: true })).toHaveLength(1)
  })

  it('borra en cascada los eventos y análisis de la planta', async () => {
    const db = createMemoryDb()
    const plant = await db.plants.create({ nombre: 'Poto' })
    await db.events.create({ plantId: plant.id, tipo: 'riego', fecha: nowIso() })

    await db.plants.remove(plant.id)

    expect(await db.events.listByPlant(plant.id)).toHaveLength(0)
  })

  it('devuelve el historial de más reciente a más antiguo', async () => {
    const db = createMemoryDb()
    const plant = await db.plants.create({ nombre: 'Helecho' })
    const hace10 = haceDias(10)
    const hace2 = haceDias(2)
    const hace5 = haceDias(5)
    await db.events.create({ plantId: plant.id, tipo: 'riego', fecha: hace10 })
    await db.events.create({ plantId: plant.id, tipo: 'comentario', fecha: hace2 })
    await db.events.create({ plantId: plant.id, tipo: 'riego', fecha: hace5 })

    const eventos = await db.events.listByPlant(plant.id)

    expect(eventos.map((e) => e.tipo)).toEqual(['comentario', 'riego', 'riego'])
    expect(eventos[0]?.fecha).toBe(hace2)
  })

  it('encuentra el último riego ignorando otros eventos', async () => {
    const db = createMemoryDb()
    const plant = await db.plants.create({ nombre: 'Lavanda' })
    const hace3 = haceDias(3)
    await db.events.create({ plantId: plant.id, tipo: 'riego', fecha: haceDias(8) })
    await db.events.create({ plantId: plant.id, tipo: 'comentario', fecha: haceDias(1), nota: 'muy seca' })
    await db.events.create({ plantId: plant.id, tipo: 'riego', fecha: hace3 })

    const ultimo = await db.events.ultimoRiego(plant.id)

    expect(ultimo?.fecha).toBe(hace3)
  })

  it('calcula el estado de riego según la frecuencia configurada', async () => {
    const db = createMemoryDb()

    const nunca = await db.plants.create({ nombre: 'Nunca', frecuenciaRiegoDias: 7 })
    expect((await db.reminders.estado(nunca.id)).estado).toBe('nunca_regada')

    const alDia = await db.plants.create({ nombre: 'Al día', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: alDia.id, tipo: 'riego', fecha: haceDias(2) })
    expect((await db.reminders.estado(alDia.id)).estado).toBe('al_dia')

    const proximo = await db.plants.create({ nombre: 'Pronto', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: proximo.id, tipo: 'riego', fecha: haceDias(7) })
    const estadoProximo = await db.reminders.estado(proximo.id)
    expect(estadoProximo.estado).toBe('proximo')
    expect(estadoProximo.diasParaRiego).toBe(0)

    const vencido = await db.plants.create({ nombre: 'Vencido', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: vencido.id, tipo: 'riego', fecha: haceDias(12) })
    const estadoVencido = await db.reminders.estado(vencido.id)
    expect(estadoVencido.estado).toBe('vencido')
    expect(estadoVencido.diasParaRiego).toBeLessThan(0)
  })

  it('lista como requiere atención las plantas con riego vencido', async () => {
    const db = createMemoryDb()
    const seca = await db.plants.create({ nombre: 'Seca', frecuenciaRiegoDias: 5 })
    await db.plants.create({ nombre: 'Contentita', frecuenciaRiegoDias: 5 })
    await db.events.create({ plantId: seca.id, tipo: 'riego', fecha: haceDias(9) })

    const items = await db.reminders.attention()

    expect(items[0]?.plantId).toBe(seca.id)
    expect(items[0]?.motivo).toBe('riego_vencido')
  })

  it('notifica a los suscriptores con cada escritura y permite darse de baja', async () => {
    const db = createMemoryDb()
    let avisos = 0
    const parar = db.subscribe(() => avisos++)

    await db.plants.create({ nombre: 'Kalanchoe' })
    expect(avisos).toBe(1)

    parar()
    await db.plants.create({ nombre: 'Sedum' })
    expect(avisos).toBe(1)
  })

  it('guarda los ajustes y los devuelve con los valores por defecto', async () => {
    const db = createMemoryDb()
    expect((await db.settings.get()).modelo).toBeTruthy()

    await db.settings.save({ apiKey: 'abc' })
    expect((await db.settings.get()).apiKey).toBe('abc')
  })
})