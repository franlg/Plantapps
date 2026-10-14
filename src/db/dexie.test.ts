import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/services/contracts'
import type { AiAnalysisDraft } from '@/types'
import { createIndexedDb } from './dexie'

/**
 * El `Blob` de jsdom no se puede clonar (fake-indexeddb clona con `structuredClone`,
 * que en jsdom convierte un Blob en un objeto vacío al recuperarlo), así que las
 * pruebas instalan el `Blob` de Node, que sí sobrevive. En el navegador da igual:
 * IndexedDB guarda los Blobs tal cual.
 */
const moduloBuffer = 'node:buffer'
const bufferDeNode = (await import(/* @vite-ignore */ moduloBuffer)) as { Blob: unknown }
globalThis.Blob = bufferDeNode.Blob as typeof globalThis.Blob

afterEach(() => {
  vi.restoreAllMocks()
})

const haceDias = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()

/** Espera real: `fecha` se genera con `new Date()`, así que dos registros seguidos
 *  pueden caer en el mismo milisegundo y la ordenación sería un empate. */
function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Cada test usa su propia base para que no se pisen entre ellos. */
let contador = 0
function nuevaDb(): Db {
  contador += 1
  return createIndexedDb(`plantapps-test-${contador}`)
}

/** Foto falsa: bytes reconocibles para poder compararlos después. */
function fotoFalsa(bytes = [1, 2, 3, 4, 5]): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
}

async function bytesDe(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

const borradorAnalisis: AiAnalysisDraft = {
  veredicto: 'regar',
  salud: 72,
  accionPrincipal: 'Riega en profundidad esta semana',
  regar: true,
  frecuenciaRiegoDias: 7,
  sintomas: ['hojas secas en la base'],
  recomendaciones: ['mover a media sombra'],
  confianza: 'media',
  resumen: 'La planta va bien pero le falta agua.',
}

describe('Db con Dexie/IndexedDB (cumplimiento del contrato)', () => {
  it('crea una planta y la recupera con sus marcas de tiempo', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Monstera', especie: 'Monstera deliciosa' })

    expect(plant.nombre).toBe('Monstera')
    expect(plant.archivada).toBe(false)
    expect(plant.creadoEn).toBe(plant.actualizadoEn)

    const guardada = await db.plants.get(plant.id)
    expect(guardada).toEqual(plant)
    expect(await db.plants.list()).toHaveLength(1)
  })

  it('ordena las plantas alfabéticamente en español', async () => {
    const db = nuevaDb()
    await db.plants.create({ nombre: 'Áloe' })
    await db.plants.create({ nombre: 'Bambú' })
    await db.plants.create({ nombre: 'Árbol' })

    expect((await db.plants.list()).map((p) => p.nombre)).toEqual(['Áloe', 'Árbol', 'Bambú'])
  })

  it('actualiza una planta y refresca actualizadoEn sin tocar creadoEn', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Ficus' })

    const updated = await db.plants.update(plant.id, { especie: 'Ficus elastica' })

    expect(updated.especie).toBe('Ficus elastica')
    expect(updated.creadoEn).toBe(plant.creadoEn)
    expect(Date.parse(updated.actualizadoEn)).toBeGreaterThanOrEqual(Date.parse(plant.actualizadoEn))
    expect(await db.plants.get(plant.id)).toEqual(updated)
  })

  it('avisa si se actualiza una planta que no existe', async () => {
    const db = nuevaDb()
    await expect(db.plants.update('no-existe', { nombre: 'X' })).rejects.toThrow('No existe la planta no-existe')
  })

  it('oculta las plantas archivadas salvo que se pidan', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Cactus' })
    await db.plants.setArchivada(plant.id, true)

    expect(await db.plants.list()).toHaveLength(0)
    expect(await db.plants.list({ incluirArchivadas: true })).toHaveLength(1)
    expect((await db.plants.get(plant.id))?.archivada).toBe(true)
  })

  it('guarda la foto de portada de una planta', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Cactus' })
    const foto = await db.photos.put(fotoFalsa())

    await db.plants.setFotoPortada(plant.id, foto.id)
    expect((await db.plants.get(plant.id))?.fotoPortadaId).toBe(foto.id)

    await db.plants.setFotoPortada(plant.id, undefined)
    expect((await db.plants.get(plant.id))?.fotoPortadaId).toBeUndefined()
  })

  it('devuelve el historial de más reciente a más antiguo y respeta el límite', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Helecho' })
    const hace10 = haceDias(10)
    const hace5 = haceDias(5)
    const hace2 = haceDias(2)
    await db.events.create({ plantId: plant.id, tipo: 'riego', fecha: hace10 })
    await db.events.create({ plantId: plant.id, tipo: 'comentario', fecha: hace2 })
    await db.events.create({ plantId: plant.id, tipo: 'riego', fecha: hace5 })

    const eventos = await db.events.listByPlant(plant.id)

    expect(eventos.map((e) => e.tipo)).toEqual(['comentario', 'riego', 'riego'])
    expect(eventos[0]?.fecha).toBe(hace2)
    expect((await db.events.listByPlant(plant.id, { limite: 2 })).map((e) => e.fecha)).toEqual([hace2, hace5])
  })

  it('lista los últimos eventos de todas las plantas', async () => {
    const db = nuevaDb()
    const una = await db.plants.create({ nombre: 'Una' })
    const otra = await db.plants.create({ nombre: 'Otra' })
    await db.events.create({ plantId: una.id, tipo: 'riego', fecha: haceDias(3) })
    await db.events.create({ plantId: otra.id, tipo: 'poda', fecha: haceDias(1) })

    expect((await db.events.listRecent()).map((e) => e.tipo)).toEqual(['poda', 'riego'])
    expect((await db.events.listRecent({ limite: 1 })).map((e) => e.tipo)).toEqual(['poda'])
  })

  it('actualiza y borra eventos sueltos', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Poto' })
    const evento = await db.events.create({ plantId: plant.id, tipo: 'comentario', fecha: haceDias(1) })

    const actualizado = await db.events.update(evento.id, { nota: 'Hojas amarillas' })
    expect(actualizado.nota).toBe('Hojas amarillas')
    expect(actualizado.creadoEn).toBe(evento.creadoEn)

    await db.events.remove(evento.id)
    expect(await db.events.listByPlant(plant.id)).toHaveLength(0)
    await expect(db.events.update(evento.id, {})).rejects.toThrow(`No existe el evento ${evento.id}`)
  })

  it('encuentra el último riego ignorando otros eventos', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Lavanda' })
    const hace3 = haceDias(3)
    await db.events.create({ plantId: plant.id, tipo: 'riego', fecha: haceDias(8) })
    await db.events.create({ plantId: plant.id, tipo: 'comentario', fecha: haceDias(1), nota: 'muy seca' })
    await db.events.create({ plantId: plant.id, tipo: 'fertilizacion', fecha: haceDias(0) })
    await db.events.create({ plantId: plant.id, tipo: 'riego', fecha: hace3 })

    const ultimo = await db.events.ultimoRiego(plant.id)

    expect(ultimo?.fecha).toBe(hace3)
  })

  it('no encuentra riego en una planta que solo tiene comentarios', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Sin riego' })
    await db.events.create({ plantId: plant.id, tipo: 'comentario', fecha: haceDias(1) })

    expect(await db.events.ultimoRiego(plant.id)).toBeUndefined()
  })

  it('borra en cascada los eventos y análisis de la planta', async () => {
    const db = nuevaDb()
    const planta = await db.plants.create({ nombre: 'Poto' })
    const otra = await db.plants.create({ nombre: 'Superviviente' })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(1) })
    const foto = await db.photos.put(fotoFalsa())
    await db.analyses.create({ ...borradorAnalisis, plantId: planta.id, photoId: foto.id, modelo: 'gemini' })
    await db.events.create({ plantId: otra.id, tipo: 'riego', fecha: haceDias(1) })

    await db.plants.remove(planta.id)

    expect(await db.plants.get(planta.id)).toBeUndefined()
    expect(await db.events.listByPlant(planta.id)).toHaveLength(0)
    expect(await db.analyses.listByPlant(planta.id)).toHaveLength(0)
    // La cascada no toca lo que pertenece a otras plantas.
    expect(await db.events.listByPlant(otra.id)).toHaveLength(1)
  })

  it('guarda las fotos con su contenido intacto', async () => {
    const db = nuevaDb()
    const blob = fotoFalsa([9, 8, 7])
    const guardada = await db.photos.put(blob)

    expect(guardada.mime).toBe('image/jpeg')
    expect(guardada.bytes).toBe(3)

    const leida = await db.photos.get(guardada.id)
    expect(leida).toBeDefined()
    expect(await bytesDe(leida?.blob ?? new Blob())).toEqual([9, 8, 7])
    expect(await bytesDe(leida?.thumb ?? new Blob())).toEqual([9, 8, 7])

    await db.photos.remove(guardada.id)
    expect(await db.photos.get(guardada.id)).toBeUndefined()
  })

  it('crea una URL de objeto para la foto y la suelta al liberar', async () => {
    const db = nuevaDb()
    let creadas = 0
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => `blob:plantapps/${(creadas += 1)}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const foto = await db.photos.put(fotoFalsa())

    const url = await db.photos.url(foto.id)
    expect(url).toBe('blob:plantapps/1')
    expect(await db.photos.url(foto.id)).toBe(url)
    expect(create).toHaveBeenCalledTimes(1)
    expect(await db.photos.url('no-existe')).toBeUndefined()

    db.photos.release(foto.id)
    expect(revoke).toHaveBeenCalledWith(url)
    expect(await db.photos.url(foto.id)).toBe('blob:plantapps/2')
  })

  it('devuelve los análisis de más reciente a más antiguo y el último', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Dracena' })
    const foto = await db.photos.put(fotoFalsa())
    const primera = await db.analyses.create({
      ...borradorAnalisis,
      veredicto: 'todo_ok',
      plantId: plant.id,
      photoId: foto.id,
      modelo: 'gemini',
    })
    await esperar(5)
    const segunda = await db.analyses.create({
      ...borradorAnalisis,
      veredicto: 'problema',
      gravedad: 'moderada',
      plantId: plant.id,
      photoId: foto.id,
      modelo: 'gemini',
    })

    const lista = await db.analyses.listByPlant(plant.id)
    expect(lista.map((a) => a.id)).toEqual([segunda.id, primera.id])
    expect((await db.analyses.ultimo(plant.id))?.id).toBe(segunda.id)
    expect(await db.analyses.get(primera.id)).toEqual(primera)
    expect((await db.analyses.ultimo('no-existe'))).toBeUndefined()

    await db.analyses.remove(segunda.id)
    expect(await db.analyses.listByPlant(plant.id)).toHaveLength(1)
  })

  it('normaliza frecuenciaRiegoDias a null si el modelo no la da', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Helecho' })
    const foto = await db.photos.put(fotoFalsa())

    const analisis = await db.analyses.create({
      ...borradorAnalisis,
      // Si el modelo no dice nada, la frecuencia se guarda como null.
      frecuenciaRiegoDias: undefined as unknown as number | null,
      plantId: plant.id,
      photoId: foto.id,
      modelo: 'gemini',
    })

    expect(analisis.frecuenciaRiegoDias).toBeNull()
  })

  it('guarda los ajustes y los devuelve con los valores por defecto', async () => {
    const db = nuevaDb()
    expect((await db.settings.get()).modelo).toBeTruthy()

    const guardado = await db.settings.save({ apiKey: 'abc' })
    expect(guardado.apiKey).toBe('abc')

    expect((await db.settings.get()).apiKey).toBe('abc')
    const otraDb = nuevaDb()
    expect((await otraDb.settings.get()).apiKey).toBeUndefined()
  })

  it('calcula el estado de riego y lista las plantas que requieren atención', async () => {
    const db = nuevaDb()
    const seca = await db.plants.create({ nombre: 'Seca', frecuenciaRiegoDias: 5 })
    await db.plants.create({ nombre: 'Contentita', frecuenciaRiegoDias: 5 })
    await db.events.create({ plantId: seca.id, tipo: 'riego', fecha: haceDias(9) })

    expect((await db.reminders.estado(seca.id)).estado).toBe('vencido')

    const items = await db.reminders.attention()
    expect(items[0]?.plantId).toBe(seca.id)
    expect(items[0]?.motivo).toBe('riego_vencido')
  })

  it('notifica a los suscriptores con cada escritura y permite darse de baja', async () => {
    const db = nuevaDb()
    let avisos = 0
    const parar = db.subscribe(() => avisos++)
    const versionInicial = db.version

    const plant = await db.plants.create({ nombre: 'Kalanchoe' })
    expect(avisos).toBe(1)
    expect(db.version).toBe(versionInicial + 1)

    await db.plants.update(plant.id, { notas: 'Va bien' })
    await db.plants.setArchivada(plant.id, true)
    await db.events.create({ plantId: plant.id, tipo: 'riego', fecha: haceDias(1) })
    await db.photos.put(fotoFalsa())
    await db.settings.save({ apiKey: 'abc' })
    await db.events.listByPlant(plant.id)
    expect(avisos).toBe(6)
    expect(db.version).toBe(versionInicial + 6)

    parar()
    await db.plants.create({ nombre: 'Sedum' })
    expect(avisos).toBe(6)
    expect(db.version).toBe(versionInicial + 7)
  })

  it('clear() borra todo y deja los ajustes por defecto', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Poto' })
    await db.events.create({ plantId: plant.id, tipo: 'riego', fecha: haceDias(1) })
    const foto = await db.photos.put(fotoFalsa())
    await db.analyses.create({ ...borradorAnalisis, plantId: plant.id, photoId: foto.id, modelo: 'gemini' })
    await db.settings.save({ apiKey: 'abc' })

    await db.clear()

    expect(await db.plants.list({ incluirArchivadas: true })).toHaveLength(0)
    expect(await db.events.listRecent()).toHaveLength(0)
    expect(await db.analyses.listByPlant(plant.id)).toHaveLength(0)
    expect(await db.photos.get(foto.id)).toBeUndefined()
    expect((await db.settings.get()).apiKey).toBeUndefined()
  })
})
