import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'
import type { Db } from '@/services/contracts'
import type { AiAnalysisDraft, FotoProgreso, GuiaCuidadosDraft, ID, StoredPhoto } from '@/types'
import { SETTINGS_POR_DEFECTO } from '@/types'
import { createIndexedDb } from './dexie'
import { createMemoryDb } from './memory'
import { getRawStore } from './backup'

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
function nombreDePrueba(): string {
  contador += 1
  return `plantapps-test-${contador}`
}
function nuevaDb(): Db {
  return createIndexedDb(nombreDePrueba())
}

/** Base nueva con su nombre a la vista, para poder mirarla en crudo después. */
function nuevaDbConNombre(): { db: Db; nombre: string } {
  const nombre = nombreDePrueba()
  return { db: createIndexedDb(nombre), nombre }
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

/** Guía de ejemplo, tal y como la devuelve el modelo. */
const borradorGuia: GuiaCuidadosDraft = {
  nombreComun: 'Monstera',
  nombreCientifico: 'Monstera deliciosa',
  familia: 'Araceae',
  resumen: 'Trepa y aguanta la falta de agua mejor de lo que parece.',
  secciones: [
    { titulo: 'Riego', contenido: 'Deja que se sequen los primeros centímetros.' },
    { titulo: 'Luz', contenido: 'Media sombra.', puntos: ['Le va bien la luz filtrada'] },
  ],
  frecuenciaRiegoDias: 7,
  dificultad: 'facil',
  basadaEnContexto: true,
}

/** Guías en miniatura, para no repetir el borrador entero en cada prueba. */
function guiaDe(plantId: string, resumen: string) {
  return { ...borradorGuia, plantId, modelo: 'gemini-3.6-flash', resumen }
}

/**
 * Abre la base con IndexedDB directamente, sin Dexie, y devuelve el resultado de
 * una consulta de solo lectura. Sirve para mirar lo que hay DE VERDADO en la
 * tabla `guides`, que es lo que demuestra que no es un mapa en memoria.
 */
function leerEnCrudo<T>(nombreBd: string, leer: (bd: IDBDatabase) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(nombreBd)
    peticion.onerror = () => reject(peticion.error)
    peticion.onsuccess = () => {
      const bd = peticion.result
      const consulta = leer(bd)
      consulta.onsuccess = () => {
        bd.close()
        resolve(consulta.result)
      }
      consulta.onerror = () => {
        bd.close()
        reject(consulta.error)
      }
    }
  })
}

/** Cuántas filas de guía hay de verdad para esa planta. */
function filasDeGuia(nombreBd: string, plantId: string): Promise<number> {
  return leerEnCrudo(nombreBd, (bd) =>
    bd.transaction('guides', 'readonly').objectStore('guides').index('plantId').count(plantId),
  )
}

/** Si ese almacén existe de verdad en la base de datos. */
function existeAlmacen(nombreBd: string, almacen: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(nombreBd)
    peticion.onerror = () => reject(peticion.error)
    peticion.onsuccess = () => {
      const bd = peticion.result
      const hay = bd.objectStoreNames.contains(almacen)
      bd.close()
      resolve(hay)
    }
  })
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
    await db.guides.create(guiaDe(plant.id, 'Antes de borrar todo.'))
    await db.settings.save({ apiKey: 'abc' })

    await db.clear()

    expect(await db.plants.list({ incluirArchivadas: true })).toHaveLength(0)
    expect(await db.events.listRecent()).toHaveLength(0)
    expect(await db.analyses.listByPlant(plant.id)).toHaveLength(0)
    expect(await db.photos.get(foto.id)).toBeUndefined()
    expect(await db.guides.get(plant.id)).toBeUndefined()
    expect((await db.settings.get()).apiKey).toBeUndefined()
  })
})

describe('Tabla guides (persistencia real)', () => {
  it('guarda la guía de una planta y la devuelve íntegra', async () => {
    const { db, nombre } = nuevaDbConNombre()
    const plant = await db.plants.create({ nombre: 'Monstera del salón' })

    expect(await db.guides.get(plant.id)).toBeUndefined()

    const guardada = await db.guides.create(guiaDe(plant.id, 'La planta del salón.'))

    expect(guardada.id).toBeTruthy()
    expect(guardada.plantId).toBe(plant.id)
    expect(guardada.modelo).toBe('gemini-3.6-flash')
    expect(Date.parse(guardada.generadoEn)).toBeGreaterThan(0)
    expect(guardada.secciones).toHaveLength(2)
    expect(guardada.secciones[1]?.puntos).toEqual(['Le va bien la luz filtrada'])

    // Está en la tabla, no en un mapa en memoria.
    expect(await filasDeGuia(nombre, plant.id)).toBe(1)
    const leida = await db.guides.get(plant.id)
    expect(leida).toEqual(guardada)
  })

  it('sustituye la guía anterior cuando se vuelve a generar', async () => {
    const { db, nombre } = nuevaDbConNombre()
    const plant = await db.plants.create({ nombre: 'Dracena' })

    const primera = await db.guides.create(guiaDe(plant.id, 'La primera.'))
    await esperar(5)
    const segunda = await db.guides.create(guiaDe(plant.id, 'La segunda.'))

    expect(segunda.id).not.toBe(primera.id)
    expect(segunda.resumen).toBe('La segunda.')
    expect(Date.parse(segunda.generadoEn)).toBeGreaterThan(Date.parse(primera.generadoEn))

    // Una planta, una sola guía vigente: la anterior desaparece de la tabla.
    expect(await filasDeGuia(nombre, plant.id)).toBe(1)
    const vigente = await db.guides.get(plant.id)
    expect(vigente?.id).toBe(segunda.id)
    expect(vigente?.resumen).toBe('La segunda.')
  })

  it('mantiene la guía de cada planta separada', async () => {
    const { db, nombre } = nuevaDbConNombre()
    const monstera = await db.plants.create({ nombre: 'Monstera' })
    const cactus = await db.plants.create({ nombre: 'Cactus' })

    await db.guides.create(guiaDe(monstera.id, 'Guía de la monstera.'))
    await db.guides.create(guiaDe(cactus.id, 'Guía del cactus.'))

    expect((await db.guides.get(monstera.id))?.resumen).toBe('Guía de la monstera.')
    expect((await db.guides.get(cactus.id))?.resumen).toBe('Guía del cactus.')
    expect(await filasDeGuia(nombre, monstera.id)).toBe(1)
    expect(await filasDeGuia(nombre, cactus.id)).toBe(1)
  })

  it('borra la guía de una planta y no falla si no tenía ninguna', async () => {
    const { db, nombre } = nuevaDbConNombre()
    const conGuia = await db.plants.create({ nombre: 'Con guía' })
    const sinGuia = await db.plants.create({ nombre: 'Sin guía' })
    await db.guides.create(guiaDe(conGuia.id, 'Se borra.'))

    await db.guides.remove(conGuia.id)
    expect(await db.guides.get(conGuia.id)).toBeUndefined()
    expect(await filasDeGuia(nombre, conGuia.id)).toBe(0)

    await expect(db.guides.remove(sinGuia.id)).resolves.toBeUndefined()
  })

  it('la guía sobrevive a cerrar y reabrir la base de datos', async () => {
    const { db, nombre } = nuevaDbConNombre()
    const plant = await db.plants.create({ nombre: 'Kalanchoe' })
    const guardada = await db.guides.create(guiaDe(plant.id, 'Sobrevive a la recarga.'))

    // Una conexión nueva al mismo almacenamiento: es lo que pasa al recargar.
    const otra = createIndexedDb(nombre)
    const trasRecargar = await otra.guides.get(plant.id)

    expect(trasRecargar).toEqual(guardada)
    expect((await otra.plants.get(plant.id))?.nombre).toBe('Kalanchoe')
  })

  it('borra en cascada la guía al borrar la planta', async () => {
    const { db, nombre } = nuevaDbConNombre()
    const seVa = await db.plants.create({ nombre: 'Se va' })
    const seQueda = await db.plants.create({ nombre: 'Se queda' })
    await db.guides.create(guiaDe(seVa.id, 'Tiene que desaparecer.'))
    await db.guides.create(guiaDe(seQueda.id, 'Esta se queda.'))

    await db.plants.remove(seVa.id)

    expect(await db.guides.get(seVa.id)).toBeUndefined()
    expect(await filasDeGuia(nombre, seVa.id)).toBe(0)
    // La cascada no toca lo que pertenece a otras plantas.
    expect((await db.guides.get(seQueda.id))?.resumen).toBe('Esta se queda.')
    expect(await filasDeGuia(nombre, seQueda.id)).toBe(1)
  })

  it('cada escritura en guides sube la versión y avisa a los suscriptores', async () => {
    const db = nuevaDb()
    const plant = await db.plants.create({ nombre: 'Ficus' })
    let avisos = 0
    const parar = db.subscribe(() => avisos++)
    const versionInicial = db.version

    await db.guides.create(guiaDe(plant.id, 'Una.'))
    expect(avisos).toBe(1)
    expect(db.version).toBe(versionInicial + 1)

    await db.guides.create(guiaDe(plant.id, 'Dos.'))
    expect(avisos).toBe(2)
    expect(db.version).toBe(versionInicial + 2)

    await db.guides.remove(plant.id)
    expect(avisos).toBe(3)
    expect(db.version).toBe(versionInicial + 3)

    parar()
    await db.guides.create(guiaDe(plant.id, 'Tres.'))
    expect(avisos).toBe(3)
    expect(db.version).toBe(versionInicial + 4)
  })
})

describe('Migración de la base de la versión 1 a la versión 2', () => {
  /**
   * Esquema exacto de la versión 1, el que se publicó. Va escrito aquí a
   * propósito, sin importar el de `dexie.ts`: el test tiene que ser un testigo
   * independiente de cómo era la base de un usuario que ya tenía datos.
   */
  const ESQUEMA_V1 = {
    plants: 'id, nombre, archivada',
    events: 'id, plantId, fecha, [plantId+fecha]',
    photos: 'id',
    analyses: 'id, plantId, fecha, [plantId+fecha]',
    settings: 'clave',
  }

  /** Rellena una base con la versión 1: planta, historial, análisis, foto y ajustes. */
  async function baseVivaEnV1(nombreBd: string) {
    const v1 = new Dexie(nombreBd)
    v1.version(1).stores(ESQUEMA_V1)
    await v1.open()

    const blob = fotoFalsa([4, 5, 6])
    await v1.table('plants').put({
      id: 'planta-v1',
      nombre: 'Ficus de la abuela',
      especie: 'Ficus elastica',
      archivada: false,
      frecuenciaRiegoDias: 9,
      creadoEn: '2026-01-05T10:00:00.000Z',
      actualizadoEn: '2026-01-05T10:00:00.000Z',
    })
    await v1.table('events').put({
      id: 'evento-v1',
      plantId: 'planta-v1',
      tipo: 'riego',
      fecha: '2026-02-11T12:00:00.000Z',
      cantidad: '300 ml',
      creadoEn: '2026-02-11T12:00:00.000Z',
    })
    await v1.table('events').put({
      id: 'comentario-v1',
      plantId: 'planta-v1',
      tipo: 'comentario',
      fecha: '2026-02-20T18:00:00.000Z',
      nota: 'Hojas amarillas',
      creadoEn: '2026-02-20T18:00:00.000Z',
    })
    await v1.table('photos').put({
      id: 'foto-v1',
      blob,
      thumb: blob,
      mime: 'image/jpeg',
      width: 800,
      height: 600,
      bytes: 3,
      creadoEn: '2026-01-05T10:00:00.000Z',
    })
    await v1.table('analyses').put({
      id: 'analisis-v1',
      plantId: 'planta-v1',
      photoId: 'foto-v1',
      fecha: '2026-03-01T09:00:00.000Z',
      modelo: 'gemini-3.6-flash',
      veredicto: 'regar',
      salud: 65,
      accionPrincipal: 'Regar esta semana',
      regar: true,
      frecuenciaRiegoDias: 9,
      sintomas: ['hojas amarillas'],
      recomendaciones: ['mover a media sombra'],
      confianza: 'alta',
      resumen: 'La planta va bien pero le falta agua.',
    })
    await v1.table('settings').put({ clave: 'app', valor: { ...SETTINGS_POR_DEFECTO, apiKey: 'clave-del-movil' } })

    v1.close()
  }

  it('conserva todos los datos y añade la tabla guides vacía', async () => {
    const nombre = nombreDePrueba()
    await baseVivaEnV1(nombre)

    // Antes de migrar, la tabla de guías no existe en el almacenamiento.
    expect(await existeAlmacen(nombre, 'guides')).toBe(false)

    // La abre la app con el esquema de la versión 2: eso dispara la migración.
    const db = createIndexedDb(nombre)

    const planta = await db.plants.get('planta-v1')
    expect(planta?.nombre).toBe('Ficus de la abuela')
    expect(planta?.especie).toBe('Ficus elastica')
    expect(planta?.frecuenciaRiegoDias).toBe(9)
    expect(planta?.archivada).toBe(false)
    expect(planta?.creadoEn).toBe('2026-01-05T10:00:00.000Z')
    expect(await db.plants.list({ incluirArchivadas: true })).toHaveLength(1)

    const eventos = await db.events.listByPlant('planta-v1')
    expect(eventos.map((e) => e.id)).toEqual(['comentario-v1', 'evento-v1'])
    expect(eventos[1]?.cantidad).toBe('300 ml')
    expect((await db.events.ultimoRiego('planta-v1'))?.id).toBe('evento-v1')

    const analisis = await db.analyses.listByPlant('planta-v1')
    expect(analisis).toHaveLength(1)
    expect(analisis[0]?.id).toBe('analisis-v1')
    expect(analisis[0]?.confianza).toBe('alta')
    expect((await db.analyses.ultimo('planta-v1'))?.accionPrincipal).toBe('Regar esta semana')

    const foto = await db.photos.get('foto-v1')
    expect(foto?.mime).toBe('image/jpeg')
    expect(foto?.width).toBe(800)
    expect(await bytesDe(foto?.blob ?? new Blob())).toEqual([4, 5, 6])

    expect((await db.settings.get()).apiKey).toBe('clave-del-movil')

    // La tabla nueva existe de verdad y arranca vacía.
    expect(await existeAlmacen(nombre, 'guides')).toBe(true)
    expect(await db.guides.get('planta-v1')).toBeUndefined()
    expect(await filasDeGuia(nombre, 'planta-v1')).toBe(0)

    // Y la planta migrada ya puede usar la tabla nueva.
    const guia = await db.guides.create(guiaDe('planta-v1', 'Guía pedida después de migrar.'))
    expect(guia.id).toBeTruthy()
    expect(await filasDeGuia(nombre, 'planta-v1')).toBe(1)
    expect((await db.guides.get('planta-v1'))?.id).toBe(guia.id)
  })

  it('no rompe una base que ya estaba en la versión 2', async () => {
    const nombre = nombreDePrueba()
    await baseVivaEnV1(nombre)

    const db = createIndexedDb(nombre)
    await db.plants.list({ incluirArchivadas: true })
    await db.guides.create(guiaDe('planta-v1', 'Primera vez.'))

    // Abrirla otra vez no toca nada.
    const otra = createIndexedDb(nombre)
    expect((await otra.plants.get('planta-v1'))?.nombre).toBe('Ficus de la abuela')
    expect((await otra.guides.get('planta-v1'))?.resumen).toBe('Primera vez.')
    expect(await filasDeGuia(nombre, 'planta-v1')).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// photos.byIds: la galería de progreso en un solo viaje
// ---------------------------------------------------------------------------

describe('photos.byIds (una consulta en bloque, no N viajes)', () => {
  it('devuelve todas las fotos pedidas con su contenido y sus datos intactos', async () => {
    const db = nuevaDb()
    const jpeg = await db.photos.put(fotoFalsa([1, 2, 3, 4, 5]), {
      thumb: new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' }),
      width: 1280,
      height: 960,
    })
    const png = await db.photos.put(new Blob([new Uint8Array([7, 7, 7])], { type: 'image/png' }), {
      thumb: new Blob([new Uint8Array([1])], { type: 'image/png' }),
      width: 640,
      height: 480,
    })

    const fotos = await db.photos.byIds([jpeg.id, png.id])

    // En el orden en que se han pedido, que es el orden de los análisis.
    expect(fotos).toHaveLength(2)
    expect(fotos.map((f) => f.id)).toEqual([jpeg.id, png.id])

    const [primera, segunda] = fotos
    expect(await bytesDe(primera?.blob ?? new Blob())).toEqual([1, 2, 3, 4, 5])
    expect(await bytesDe(primera?.thumb ?? new Blob())).toEqual([9, 9])
    expect(primera?.mime).toBe('image/jpeg')
    expect(primera?.width).toBe(1280)
    expect(primera?.height).toBe(960)
    expect(primera?.bytes).toBe(5)
    expect(primera?.creadoEn).toBe(jpeg.creadoEn)

    expect(await bytesDe(segunda?.blob ?? new Blob())).toEqual([7, 7, 7])
    expect(await bytesDe(segunda?.thumb ?? new Blob())).toEqual([1])
    expect(segunda?.mime).toBe('image/png')
    expect(segunda?.width).toBe(640)
    expect(segunda?.height).toBe(480)
    expect(segunda?.bytes).toBe(3)
    expect(segunda?.creadoEn).toBe(png.creadoEn)
  })

  it('con ids vacíos devuelve una lista vacía y no falla', async () => {
    const db = nuevaDb()
    await db.photos.put(fotoFalsa([1]))
    const vacia = nuevaDb()

    // Con fotos y con la base vacía: nada que pedir, nada que devolver.
    expect(await db.photos.byIds([])).toEqual([])
    expect(await vacia.photos.byIds([])).toEqual([])
  })

  it('omite las fotos que no existen, incluso si se piden solas', async () => {
    const db = nuevaDb()
    const una = await db.photos.put(fotoFalsa([1]))
    const otra = await db.photos.put(fotoFalsa([2]))

    const fotos = await db.photos.byIds([una.id, 'foto-fantasma', otra.id])
    expect(fotos.map((f) => f.id)).toEqual([una.id, otra.id])

    expect(await db.photos.byIds(['no-existe-1', 'no-existe-2'])).toEqual([])
  })

  it('no repite las fotos cuando la lista trae ids duplicados', async () => {
    const db = nuevaDb()
    const una = await db.photos.put(fotoFalsa([1]))
    const otra = await db.photos.put(fotoFalsa([2]))

    const fotos = await db.photos.byIds([una.id, otra.id, una.id, otra.id, una.id])

    expect(fotos).toHaveLength(2)
    // En el orden de su primera aparición, igual que la implementación en memoria.
    expect(fotos.map((f) => f.id)).toEqual([una.id, otra.id])
  })

  it('devuelve las 200 fotos de una galería larga, en el orden pedido', async () => {
    const db = nuevaDb()
    const contenido = new Map<ID, number[]>()
    for (let i = 0; i < 200; i += 1) {
      const bytes = [i % 251, (i * 7) % 251]
      const foto = await db.photos.put(fotoFalsa(bytes))
      contenido.set(foto.id, bytes)
    }
    // Se piden al revés: el resultado sigue al pedido, no viene ordenado por id.
    const pedido = [...contenido.keys()].reverse()

    const fotos = await db.photos.byIds(pedido)

    expect(fotos).toHaveLength(200)
    expect(fotos.map((f) => f.id)).toEqual(pedido)
    for (const foto of fotos) {
      expect(foto.bytes).toBe(2)
      expect(await bytesDe(foto.blob)).toEqual(contenido.get(foto.id))
      // Sin miniatura propia, la miniatura es el propio blob.
      expect(await bytesDe(foto.thumb)).toEqual(contenido.get(foto.id))
    }
  })

  it('url() sigue cacheando la ObjectURL igual después de una consulta en bloque', async () => {
    const db = nuevaDb()
    let creadas = 0
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => `blob:plantapps/byids/${(creadas += 1)}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const foto = await db.photos.put(fotoFalsa([3, 4]))

    // Recuperar la foto en bloque ni gasta ni suelta ninguna URL.
    const [recuperada] = await db.photos.byIds([foto.id])
    expect(recuperada?.id).toBe(foto.id)
    expect(create).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()

    // La caché de urls sigue igual: dos llamadas, la misma url, una sola creación.
    const url = await db.photos.url(foto.id)
    expect(await db.photos.url(foto.id)).toBe(url)
    expect(create).toHaveBeenCalledTimes(1)
    expect(await db.photos.url('no-existe')).toBeUndefined()

    db.photos.release(foto.id)
    expect(revoke).toHaveBeenCalledWith(url)
    expect(await db.photos.url(foto.id)).toBe('blob:plantapps/byids/2')
  })

  it('devuelve lo mismo que la implementación en memoria', async () => {
    const memoria = createMemoryDb()
    const db = nuevaDb()
    const crudo = getRawStore(db)
    if (!crudo) throw new Error('la base con Dexie debe ofrecer acceso en crudo')

    // Las mismas cuatro fotos, con los mismos ids, en las dos implementaciones.
    const fotos: StoredPhoto[] = []
    for (let i = 1; i <= 4; i += 1) {
      fotos.push(
        await memoria.photos.put(fotoFalsa([i, i]), {
          thumb: fotoFalsa([i]),
          width: i * 10,
          height: i * 5,
        }),
      )
    }
    const [f1, f2, f3, f4] = fotos
    await crudo.writeAll({ plants: [], events: [], analyses: [], guias: [], fotos })

    // La segunda no se pide: así se ve que byIds tampoco devuelve fotos de más.
    const pedido = [f3.id, f1.id, 'no-existe', f4.id]
    const enMemoria = (await memoria.photos.byIds(pedido)).map((f) => f.id)
    const enDexie = (await db.photos.byIds(pedido)).map((f) => f.id)

    expect(enDexie).toEqual([f3.id, f1.id, f4.id])
    expect(enDexie).not.toContain(f2.id)
    expect(enDexie).toEqual(enMemoria)
  })
})

// ---------------------------------------------------------------------------
// El camino entero del progreso visual: planta -> análisis -> fotos en bloque
// ---------------------------------------------------------------------------

/**
 * El mismo camino que recorre el hook `useFotosProgreso` de `src/db/context.tsx`,
 * pero sin React: lo que se prueba aquí es el camino de datos contra la base
 * real, no el hook (eso es de la capa de interfaz).
 */
async function fotosProgreso(db: Db, plantId: ID | undefined): Promise<FotoProgreso[]> {
  if (!plantId) return []
  const planta = await db.plants.get(plantId)
  if (!planta) return []

  const analisis = await db.analyses.listByPlant(plantId)
  const fotos = await db.photos.byIds(
    analisis.map((a) => a.photoId).filter((id): id is ID => Boolean(id)),
  )
  const porId = new Map(fotos.map((f) => [f.id, f]))

  const entradas: FotoProgreso[] = []
  for (const a of analisis) {
    if (!a.photoId || !porId.has(a.photoId)) continue
    entradas.push({
      id: a.photoId,
      fecha: a.fecha,
      origen: 'analisis',
      analysisId: a.id,
      veredicto: a.veredicto,
    })
  }

  if (planta.fotoPortadaId && porId.has(planta.fotoPortadaId)) {
    // La portada va la primera si no es ya la del análisis más reciente.
    const yaEstaba = entradas[0]?.id === planta.fotoPortadaId
    if (!yaEstaba) {
      entradas.unshift({ id: planta.fotoPortadaId, fecha: planta.actualizadoEn, origen: 'portada' })
    }
  }

  return entradas
}

describe('Camino del progreso visual contra la base real (plants -> analyses -> photos.byIds)', () => {
  it('una planta con 3 análisis y 3 fotos distintas saca las 3, de más reciente a más antigua', async () => {
    const db = nuevaDb()
    const planta = await db.plants.create({ nombre: 'Monstera del salón' })
    const foto1 = await db.photos.put(fotoFalsa([1]))
    const foto2 = await db.photos.put(fotoFalsa([2]))
    const foto3 = await db.photos.put(fotoFalsa([3]))

    const a1 = await db.analyses.create({
      ...borradorAnalisis,
      veredicto: 'regar',
      plantId: planta.id,
      photoId: foto1.id,
      modelo: 'gemini-3.6-flash',
    })
    await esperar(5)
    const a2 = await db.analyses.create({
      ...borradorAnalisis,
      veredicto: 'problema',
      gravedad: 'moderada',
      regar: false,
      plantId: planta.id,
      photoId: foto2.id,
      modelo: 'gemini-3.6-flash',
    })
    await esperar(5)
    const a3 = await db.analyses.create({
      ...borradorAnalisis,
      veredicto: 'todo_ok',
      regar: false,
      plantId: planta.id,
      photoId: foto3.id,
      modelo: 'gemini-3.6-flash',
    })

    const progreso = await fotosProgreso(db, planta.id)

    expect(progreso.map((p) => p.id)).toEqual([foto3.id, foto2.id, foto1.id])
    expect(progreso.map((p) => p.origen)).toEqual(['analisis', 'analisis', 'analisis'])
    expect(progreso.map((p) => p.analysisId)).toEqual([a3.id, a2.id, a1.id])
    expect(progreso.map((p) => p.veredicto)).toEqual(['todo_ok', 'problema', 'regar'])
    expect(progreso.map((p) => p.fecha)).toEqual([a3.fecha, a2.fecha, a1.fecha])
  })

  it('un análisis cuya foto se borró se omite y no rompe el camino', async () => {
    const db = nuevaDb()
    const planta = await db.plants.create({ nombre: 'Poto' })
    const fotoBuena = await db.photos.put(fotoFalsa([1]))
    const fotoBorrada = await db.photos.put(fotoFalsa([2]))

    await db.analyses.create({
      ...borradorAnalisis,
      plantId: planta.id,
      photoId: fotoBorrada.id,
      modelo: 'gemini-3.6-flash',
    })
    await esperar(5)
    const analisisBueno = await db.analyses.create({
      ...borradorAnalisis,
      plantId: planta.id,
      photoId: fotoBuena.id,
      modelo: 'gemini-3.6-flash',
    })
    await db.photos.remove(fotoBorrada.id)

    const progreso = await fotosProgreso(db, planta.id)

    expect(progreso.map((p) => p.id)).toEqual([fotoBuena.id])
    expect(progreso.map((p) => p.analysisId)).toEqual([analisisBueno.id])
    // El análisis sigue en el historial: lo que falta es su foto.
    expect(await db.analyses.listByPlant(planta.id)).toHaveLength(2)
    expect(await db.photos.byIds([fotoBorrada.id])).toEqual([])
  })

  it('una planta sin análisis no devuelve nada, aunque haya fotos de otras plantas', async () => {
    const db = nuevaDb()
    const planta = await db.plants.create({ nombre: 'Lavanda' })
    const otra = await db.plants.create({ nombre: 'Otra' })
    const fotoOtra = await db.photos.put(fotoFalsa([5]))
    await db.analyses.create({
      ...borradorAnalisis,
      plantId: otra.id,
      photoId: fotoOtra.id,
      modelo: 'gemini-3.6-flash',
    })
    const fotoSuelta = await db.photos.put(fotoFalsa([6]))

    expect(await fotosProgreso(db, planta.id)).toEqual([])

    // Y las fotos sueltas sí se recuperan cuando se piden: la consulta no
    // depende de que haya análisis.
    expect((await db.photos.byIds([fotoSuelta.id, fotoOtra.id])).map((f) => f.id)).toEqual([
      fotoSuelta.id,
      fotoOtra.id,
    ])
    // Plantas que no existen y la ausencia de planta tampoco fallan.
    expect(await fotosProgreso(db, 'planta-fantasma')).toEqual([])
    expect(await fotosProgreso(db, undefined)).toEqual([])
  })

  it('una planta con portada y sin análisis recupera la portada por su cuenta', async () => {
    const db = nuevaDb()
    const planta = await db.plants.create({ nombre: 'Cactus' })
    const portada = await db.photos.put(fotoFalsa([9]))
    await db.plants.setFotoPortada(planta.id, portada.id)

    // El camino del hook solo mira los análisis de la planta: sin ninguno, la
    // galería sale vacía. No es un fallo de byIds, es lo que hace el hook.
    expect(await fotosProgreso(db, planta.id)).toEqual([])

    // La portada se recupera sola, pidiéndola directamente en bloque.
    const [recuperada] = await db.photos.byIds([portada.id])
    expect(recuperada?.id).toBe(portada.id)
    expect(recuperada?.mime).toBe('image/jpeg')
    expect(recuperada?.bytes).toBe(1)
    expect(await bytesDe(recuperada?.blob ?? new Blob())).toEqual([9])
    // Y se puede pedir junto a otras sin que ninguna se pierda.
    const portadaYAnalisis = await db.photos.byIds([portada.id, portada.id])
    expect(portadaYAnalisis).toHaveLength(1)
    expect(portadaYAnalisis[0]?.id).toBe(portada.id)
  })

  it('la portada no se duplica si ya es la del análisis más reciente', async () => {
    const db = nuevaDb()
    const planta = await db.plants.create({ nombre: 'Ficus' })
    const portada = await db.photos.put(fotoFalsa([1]))
    await db.plants.setFotoPortada(planta.id, portada.id)
    await esperar(5)
    const analisis = await db.analyses.create({
      ...borradorAnalisis,
      plantId: planta.id,
      photoId: portada.id,
      modelo: 'gemini-3.6-flash',
    })

    const progreso = await fotosProgreso(db, planta.id)

    expect(progreso).toHaveLength(1)
    expect(progreso[0]?.id).toBe(portada.id)
    expect(progreso[0]?.origen).toBe('analisis')
    expect(progreso[0]?.analysisId).toBe(analisis.id)
  })

  it('una galería de verdad, con 200 análisis y 200 fotos, las recupera todas', async () => {
    const db = nuevaDb()
    const planta = await db.plants.create({ nombre: 'Monstera del salón' })

    const idsFotos: ID[] = []
    for (let i = 0; i < 200; i += 1) {
      idsFotos.push((await db.photos.put(fotoFalsa([i % 251]))).id)
    }
    for (const photoId of idsFotos) {
      await db.analyses.create({
        ...borradorAnalisis,
        plantId: planta.id,
        photoId,
        modelo: 'gemini-3.6-flash',
      })
    }

    const analisis = await db.analyses.listByPlant(planta.id)
    const fotos = await db.photos.byIds(analisis.map((a) => a.photoId))
    const progreso = await fotosProgreso(db, planta.id)

    expect(analisis).toHaveLength(200)
    expect(fotos).toHaveLength(200)
    expect(progreso).toHaveLength(200)
    // Ni sobra ni falta ninguna: las pedidas y las devueltas son las mismas.
    expect([...fotos.map((f) => f.id)].sort()).toEqual([...idsFotos].sort())
    expect([...progreso.map((p) => p.id)].sort()).toEqual([...idsFotos].sort())
  })
})
