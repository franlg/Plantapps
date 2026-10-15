import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { BackupFile } from '@/services/contracts'
import type { AiAnalysisDraft } from '@/types'
import { createIndexedDb } from './dexie'
import { createBackupService } from './backup'
import { createMemoryDb } from './memory'

/**
 * El `Blob` de jsdom no se puede clonar (fake-indexeddb clona con `structuredClone`,
 * que en jsdom convierte un Blob en un objeto vacío al recuperarlo), así que las
 * pruebas instalan el `Blob` de Node, que sí sobrevive. En el navegador da igual:
 * IndexedDB guarda los Blobs tal cual.
 */
const moduloBuffer = 'node:buffer'
const bufferDeNode = (await import(/* @vite-ignore */ moduloBuffer)) as { Blob: unknown }
globalThis.Blob = bufferDeNode.Blob as typeof globalThis.Blob

const haceDias = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()

function fotoFalsa(bytes: number[]): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
}

async function bytesDe(blob: Blob | undefined): Promise<number[]> {
  return Array.from(new Uint8Array(await (blob ?? new Blob()).arrayBuffer()))
}

/** Mensaje del error que lanza una promesa, en texto plano. */
async function mensajeDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('Se esperaba un error y la operación terminó bien')
}

/** Datos que no encajan con el contrato: para probar la validación de Zod. */
function comoCopia(datos: Record<string, unknown>): BackupFile {
  return datos as unknown as BackupFile
}

const borradorAnalisis: AiAnalysisDraft = {
  veredicto: 'regar',
  salud: 72,
  accionPrincipal: 'Riega en profundidad esta semana',
  regar: true,
  frecuenciaRiegoDias: 7,
  problema: 'Faltan flores',
  gravedad: 'leve',
  sintomas: ['las hojas se van a marchitar', 'hojas secas en la base'],
  recomendaciones: ['mover a media sombra'],
  confianza: 'media',
  resumen: 'La planta va bien pero le falta agua.',
}

/** Base de pruebas con plantas, historial, análisis y una foto. */
async function baseConDatos(nombreBd: string) {
  const db = createIndexedDb(nombreBd)

  const monstera = await db.plants.create({
    nombre: 'Monstera del salón',
    especie: 'Monstera deliciosa',
    fechaPlantado: '2026-01-15',
    frecuenciaRiegoDias: 7,
    maceta: '18 cm',
    ubicacion: 'junto a la ventana',
    luz: 'sol_indirecto',
    notas: 'Agua con filtro',
  })
  const foto = await db.photos.put(fotoFalsa([10, 20, 30]))
  await db.plants.setFotoPortada(monstera.id, foto.id)
  await db.events.create({ plantId: monstera.id, tipo: 'riego', fecha: haceDias(4), cantidad: '300 ml' })
  await db.events.create({ plantId: monstera.id, tipo: 'comentario', fecha: haceDias(1), nota: 'Hojas amarillas' })
  const analisis = await db.analyses.create({
    ...borradorAnalisis,
    plantId: monstera.id,
    photoId: foto.id,
    modelo: 'gemini-3.8-flash',
    raw: '{"ok":true}',
  })

  const cactus = await db.plants.create({ nombre: 'Cactus archivado', frecuenciaRiegoDias: 21 })
  await db.plants.setArchivada(cactus.id, true)
  await db.events.create({ plantId: cactus.id, tipo: 'riego', fecha: haceDias(9) })

  return { db, monstera: await db.plants.get(monstera.id), foto, analisis, cactus }
}

describe('Copias de seguridad', () => {
  it('exporta una base vacía con el formato correcto', async () => {
    const db = createIndexedDb('copia-vacia')

    const copia = await createBackupService(db).exportAll()

    expect(copia).toEqual({
      formato: 'plantapps-backup',
      version: 1,
      exportadoEn: expect.any(String),
      plants: [],
      events: [],
      analyses: [],
      guias: [],
      fotos: [],
    })
  })

  it('exporta, borra todo y restaura en modo reemplazar los mismos datos', async () => {
    const { db, monstera, foto, analisis } = await baseConDatos('copia-reemplazar')
    const servicio = createBackupService(db)

    const copia = await servicio.exportAll()
    expect(copia.plants).toHaveLength(2)
    expect(copia.events).toHaveLength(3)
    expect(copia.analyses).toHaveLength(1)
    expect(copia.fotos).toHaveLength(1)
    expect(copia.fotos[0]?.id).toBe(foto.id)
    expect(copia.plants.find((p) => p.id === monstera?.id)?.fotoPortadaId).toBe(foto.id)

    // La copia tiene que poder ir y volver por JSON, como cuando se guarda el archivo.
    const desdeArchivo: BackupFile = JSON.parse(JSON.stringify(copia))

    await db.clear()
    expect(await db.plants.list({ incluirArchivadas: true })).toHaveLength(0)
    expect(await db.events.listRecent()).toHaveLength(0)
    expect(await db.photos.get(foto.id)).toBeUndefined()

    const informe = await servicio.importAll(desdeArchivo, 'reemplazar')

    expect(informe).toEqual({ plants: 2, events: 3, analyses: 1, guias: 0, fotos: 1 })

    const plantas = await db.plants.list({ incluirArchivadas: true })
    expect(plantas).toEqual(copia.plants)
    expect(plantas.map((p) => p.nombre)).toEqual(['Cactus archivado', 'Monstera del salón'])
    // La marca de archivada también vuelve: por defecto solo se ve la activa.
    expect((await db.plants.list()).map((p) => p.nombre)).toEqual(['Monstera del salón'])

    const eventoRiego = desdeArchivo.events.find((e) => e.tipo === 'riego' && e.plantId === monstera?.id)
    expect(await db.events.listByPlant(monstera?.id ?? '')).toEqual(
      copia.events.filter((e) => e.plantId === monstera?.id),
    )
    expect(eventoRiego?.cantidad).toBe('300 ml')

    const restoredAnalisis = await db.analyses.listByPlant(monstera?.id ?? '')
    expect(restoredAnalisis).toEqual(copia.analyses)
    expect(restoredAnalisis[0]?.id).toBe(analisis.id)
    expect(restoredAnalisis[0]?.raw).toBe('{"ok":true}')

    const fotoRestaurada = await db.photos.get(foto.id)
    expect(fotoRestaurada).toBeDefined()
    expect(fotoRestaurada?.mime).toBe('image/jpeg')
    expect(fotoRestaurada?.width).toBe(0)
    expect(fotoRestaurada?.bytes).toBe(3)
    expect(await bytesDe(fotoRestaurada?.blob)).toEqual([10, 20, 30])
    expect(await bytesDe(fotoRestaurada?.thumb)).toEqual([10, 20, 30])
  })

  it('importar en modo fusionar no duplica registros', async () => {
    const { db, monstera, foto } = await baseConDatos('copia-fusionar-origen')
    const copia = await createBackupService(db).exportAll()

    const destino = createIndexedDb('copia-fusionar-destino')
    const servicioDestino = createBackupService(destino)
    const previa = await destino.plants.create({ nombre: 'Poto previa' })

    const informe = await servicioDestino.importAll(copia, 'fusionar')
    expect(informe).toEqual({ plants: 2, events: 3, analyses: 1, guias: 0, fotos: 1 })
    expect((await destino.plants.list({ incluirArchivadas: true })).map((p) => p.nombre)).toEqual([
      'Cactus archivado',
      'Monstera del salón',
      'Poto previa',
    ])
    expect((await destino.plants.get(previa.id))?.nombre).toBe('Poto previa')

    // Importar otra vez el mismo archivo: sustituye por id, no añade copias.
    const renombrada: BackupFile = {
      ...copia,
      plants: copia.plants.map((p) => (p.id === monstera?.id ? { ...p, nombre: 'Monstera renombrada' } : p)),
    }
    const segundoInforme = await servicioDestino.importAll(renombrada, 'fusionar')

    expect(segundoInforme).toEqual({ plants: 2, events: 3, analyses: 1, guias: 0, fotos: 1 })
    const plantas = await destino.plants.list({ incluirArchivadas: true })
    expect(plantas).toHaveLength(3)
    expect(plantas.filter((p) => p.nombre.startsWith('Monstera'))).toHaveLength(1)
    expect(await destino.events.listRecent()).toHaveLength(3)
    expect(await destino.analyses.listByPlant(monstera?.id ?? '')).toHaveLength(1)
    expect(await destino.photos.get(foto.id)).toBeDefined()
  })

  it('rechaza un archivo con otro formato con un error legible en español', async () => {
    const { db } = await baseConDatos('copia-errores')
    const servicio = createBackupService(db)
    const copia = await servicio.exportAll()

    const otroFormato = await mensajeDeError(
      servicio.importAll(comoCopia({ ...copia, formato: 'otra-app' }), 'reemplazar'),
    )
    expect(otroFormato).toContain('El archivo de copia de seguridad no es válido')
    expect(otroFormato).toContain('formato')

    const otraVersion = await mensajeDeError(
      servicio.importAll(comoCopia({ ...copia, version: 2 }), 'fusionar'),
    )
    expect(otraVersion).toContain('version')

    const sinClaves = await mensajeDeError(servicio.importAll(comoCopia({}), 'fusionar'))
    expect(sinClaves).toContain('El archivo de copia de seguridad no es válido')

    const datosRotos = await mensajeDeError(
      servicio.importAll(comoCopia({ ...copia, plants: 'esto no es una lista' }), 'reemplazar'),
    )
    expect(datosRotos).toContain('plants')

    const fotoRota = await mensajeDeError(
      servicio.importAll(comoCopia({ ...copia, fotos: [{ ...copia.fotos[0], base64: 'no es base64 !!!' }] }), 'fusionar'),
    )
    expect(fotoRota).toContain('fotos')

    // Nada de eso ha tocado la base de datos.
    expect(await db.plants.list({ incluirArchivadas: true })).toHaveLength(2)
    expect(await db.events.listRecent()).toHaveLength(3)
  })

  it('rechaza un JSON corrupto con un error legible en español', async () => {
    const { db } = await baseConDatos('copia-json-roto')
    const servicio = createBackupService(db)

    const textoRoto = await mensajeDeError(servicio.importAll('{"formato": "plantapps-backup", ', 'reemplazar'))
    expect(textoRoto).toContain('El archivo no contiene JSON válido')

    const jsonQueNoEsCopia = await mensajeDeError(servicio.importAll('[]', 'reemplazar'))
    expect(jsonQueNoEsCopia).toContain('El archivo de copia de seguridad no es válido')

    const copia = await servicio.exportAll()
    const modoInvalido = await mensajeDeError(servicio.importAll(copia, comoModo('borrar todo')))
    expect(modoInvalido).toContain('no es válido')
  })

  it('avisa con un error claro si la base de datos no da acceso directo', async () => {
    const memoria = createMemoryDb()
    const servicio = createBackupService(memoria)
    await memoria.plants.create({ nombre: 'En memoria' })

    const copia = await servicio.exportAll()
    expect(copia.plants).toHaveLength(1)

    const mensaje = await mensajeDeError(servicio.importAll(copia, 'fusionar'))
    expect(mensaje).toContain('no admite importar copias de seguridad')
  })
})

/** Modo que no existe en el contrato, para probar la validación del parámetro. */
function comoModo(modo: string): 'reemplazar' | 'fusionar' {
  return modo as 'reemplazar' | 'fusionar'
}
