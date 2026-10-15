import type { BackupFile, BackupService, Db, ImportReport } from '@/services/contracts'
import type {
  AiAnalysis,
  CareEvent,
  Confianza,
  GuiaCuidados,
  Gravedad,
  Luz,
  Plant,
  StoredPhoto,
  Veredicto,
} from '@/types'
import { z } from 'zod'
import { TIPOS_EVENTO } from '@/types'
import { nowIso } from '@/lib/dates'

/**
 * COPIAS DE SEGURIDAD
 * ===================
 * Exporta e importa el contenido de la app en un único archivo JSON con las
 * fotos en base64. La validación del archivo se hace con Zod: si algo no cuadra
 * se explica en español y no se toca la base de datos.
 */

// ---------------------------------------------------------------------------
// Acceso directo al almacén
// ---------------------------------------------------------------------------

/** Registros tal cual vienen de la copia, ya validados. */
export interface RawSnapshot {
  plants: Plant[]
  events: CareEvent[]
  analyses: AiAnalysis[]
  guias: GuiaCuidados[]
  fotos: StoredPhoto[]
}

/**
 * Acceso de escritura que ofrecen algunas implementaciones de `Db`.
 *
 * La interfaz pública solo permite crear registros con id nuevo y ponerles la
 * fecha del momento, así que restaurar una copia respetando los ids y las marcas
 * de tiempo originales necesita esta vía. La implementación con Dexie la
 * registra al arrancar (ver `src/db/dexie.ts`); la de memoria no la ofrece.
 */
export interface RawStore {
  /** Escribe los registros tal cual. Los que ya existan con el mismo id se sustituyen. */
  writeAll(datos: RawSnapshot): Promise<void>
  /** Borra plantas, eventos, análisis, fotos y ajustes. */
  clearAll(): Promise<void>
}

const rawStores = new WeakMap<Db, RawStore>()

/** Lo llama la implementación de `Db` que puede escribir en crudo. */
export function attachRawStore(db: Db, store: RawStore): void {
  rawStores.set(db, store)
}

/** Acceso directo si esta implementación de `Db` lo ofrece. */
export function getRawStore(db: Db): RawStore | undefined {
  return rawStores.get(db)
}

// ---------------------------------------------------------------------------
// Esquemas de validación (Zod)
// ---------------------------------------------------------------------------

const TIPOS_LUZ = ['sol_directo', 'sol_indirecto', 'sombra', 'interior'] satisfies readonly Luz[]
const VEREDICTOS = ['regar', 'no_regar', 'trasplantar', 'problema', 'todo_ok'] satisfies readonly Veredicto[]
const CONFIANZAS = ['alta', 'media', 'baja'] satisfies readonly Confianza[]
const GRAVEDADES = ['ninguna', 'leve', 'moderada', 'grave'] satisfies readonly Gravedad[]

const MODOS = ['reemplazar', 'fusionar'] as const

/** Base64 estándar (sin el prefijo `data:`), tal y como se guarda en la copia. */
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

const idSchema = z.string().min(1, 'vacío')
const fechaSchema = z.string().min(1)

const plantSchema = z.object({
  id: idSchema,
  nombre: z.string().min(1),
  especie: z.string().optional(),
  fechaPlantado: fechaSchema.optional(),
  frecuenciaRiegoDias: z.number().int().nonnegative().optional(),
  maceta: z.string().optional(),
  ubicacion: z.string().optional(),
  luz: z.enum(TIPOS_LUZ).optional(),
  notas: z.string().optional(),
  fotoPortadaId: z.string().optional(),
  archivada: z.boolean(),
  creadoEn: fechaSchema,
  actualizadoEn: fechaSchema,
})

const eventSchema = z.object({
  id: idSchema,
  plantId: idSchema,
  tipo: z.enum(TIPOS_EVENTO),
  fecha: fechaSchema,
  nota: z.string().optional(),
  analysisId: z.string().optional(),
  cantidad: z.string().optional(),
  creadoEn: fechaSchema,
})

const analysisSchema = z.object({
  id: idSchema,
  plantId: idSchema,
  photoId: idSchema,
  fecha: fechaSchema,
  modelo: z.string(),
  veredicto: z.enum(VEREDICTOS),
  salud: z.number().min(0).max(100),
  accionPrincipal: z.string(),
  regar: z.boolean(),
  frecuenciaRiegoDias: z.number().int().nonnegative().nullable(),
  problema: z.string().optional(),
  gravedad: z.enum(GRAVEDADES).optional(),
  sintomas: z.array(z.string()),
  recomendaciones: z.array(z.string()),
  confianza: z.enum(CONFIANZAS),
  resumen: z.string(),
  raw: z.string().optional(),
})

const fotoSchema = z.object({
  id: idSchema,
  mime: z.string().min(1),
  base64: z.string().regex(BASE64),
  thumbBase64: z.string().regex(BASE64),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
})

const seccionSchema = z.object({
  titulo: z.string().min(1),
  contenido: z.string(),
  puntos: z.array(z.string()).optional(),
})

const guiaSchema = z.object({
  id: z.string().min(1),
  plantId: z.string().min(1),
  nombreComun: z.string(),
  nombreCientifico: z.string(),
  familia: z.string(),
  resumen: z.string(),
  secciones: z.array(seccionSchema),
  frecuenciaRiegoDias: z.number().int().min(1).max(90).nullable(),
  dificultad: z.enum(['facil', 'media', 'avanzada']),
  basadaEnContexto: z.boolean(),
  generadoEn: fechaSchema,
  modelo: z.string(),
})

const copiaSchema = z.object({
  formato: z.literal('plantapps-backup'),
  version: z.literal(1),
  exportadoEn: fechaSchema,
  plants: z.array(plantSchema),
  events: z.array(eventSchema),
  analyses: z.array(analysisSchema),
  // Con `.default([])` las copias hechas antes de las guías siguen importando bien.
  guias: z.array(guiaSchema).default([]),
  fotos: z.array(fotoSchema),
})

const modoSchema = z.enum(MODOS)

/** Explicación en español de cada tipo de problema de Zod. */
const MOTIVOS: Record<string, string> = {
  invalid_type: 'no es del tipo esperado',
  invalid_value: 'no tiene un valor válido',
  invalid_literal: 'no es el valor esperado',
  too_small: 'es demasiado corto o pequeño',
  too_big: 'es demasiado largo o grande',
  invalid_format: 'no tiene el formato esperado',
  invalid_union: 'no coincide con ningún valor válido',
  unrecognized_keys: 'tiene campos que no conozco',
  invalid_key: 'tiene una clave que no es válida',
  invalid_element: 'tiene un elemento que no es válido',
}

function rutaDe(issue: { path: PropertyKey[] }): string {
  if (issue.path.length === 0) return 'el archivo'
  return issue.path.map((p) => (typeof p === 'number' ? `[${p + 1}]` : String(p))).join('.')
}

/** Lanza un error legible en español si la copia no cumple el formato. */
function validarCopia(datos: unknown): BackupFile {
  const resultado = copiaSchema.safeParse(datos)
  if (resultado.success) return resultado.data

  const problemas = resultado.error.issues
    .slice(0, 5)
    .map((issue) => `"${rutaDe(issue)}" ${MOTIVOS[issue.code] ?? 'no es válido'}`)
  const detalle = problemas.join('; ')
  const cola =
    resultado.error.issues.length > problemas.length ? ` (y ${resultado.error.issues.length - problemas.length} más)` : ''

  throw new Error(`El archivo de copia de seguridad no es válido: ${detalle}${cola}.`)
}

/** Acepta el objeto ya parseado o el texto del archivo, y siempre devuelve JSON legible. */
function aObjeto(data: BackupFile | string): unknown {
  if (typeof data !== 'string') return data
  try {
    return JSON.parse(data)
  } catch (error) {
    const detalle = error instanceof Error ? error.message : 'error desconocido'
    throw new Error(`El archivo no contiene JSON válido: ${detalle}.`)
  }
}

// ---------------------------------------------------------------------------
// Conversión de fotos
// ---------------------------------------------------------------------------

const TROZO = 0x8000

async function blobABase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binario = ''
  for (let inicio = 0; inicio < bytes.length; inicio += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(inicio, inicio + TROZO))
  }
  return btoa(binario)
}

function base64ABlob(base64: string, mime: string): Blob {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

/** Modos de importación admitidos. */
export type ModoImportacion = 'reemplazar' | 'fusionar'

/**
 * `BackupService` con una comodidad: `importAll` también acepta el texto del
 * archivo tal cual viene de `<input type="file">`, sin tener que hacer `JSON.parse`
 * antes (si el JSON está corrupto, el error se dice en español).
 */
export interface BackupServiceConTexto extends BackupService {
  importAll(data: BackupFile | string, modo: ModoImportacion): Promise<ImportReport>
}

/**
 * Copias de seguridad sobre cualquier `Db`.
 *
 * La exportación usa siempre la interfaz pública (lecturas). La importación
 * necesita conservar ids y fechas, así que exige una implementación con acceso
 * directo al almacén; si no lo hay, lo dice con un error claro en vez de
 * restaurar los datos con ids cambiados.
 */
export function createBackupService(db: Db): BackupServiceConTexto {
  /** Fotos de portada y de análisis, sin repetir. */
  async function fotosEnUso(plants: Plant[], analyses: AiAnalysis[]): Promise<StoredPhoto[]> {
    const ids = new Set<string>()
    for (const planta of plants) if (planta.fotoPortadaId) ids.add(planta.fotoPortadaId)
    for (const analisis of analyses) if (analisis.photoId) ids.add(analisis.photoId)

    const fotos: StoredPhoto[] = []
    for (const id of ids) {
      const foto = await db.photos.get(id)
      if (foto) fotos.push(foto)
    }
    return fotos
  }

  return {
    /**
     * Copia completa: plantas (incluidas las archivadas), historial, análisis y las
     * fotos usadas como portada o en algún análisis, en base64. Los análisis se
     * recuperan planta a planta, así que solo se copian los que siguen teniendo
     * una planta asociada.
     */
    async exportAll(): Promise<BackupFile> {
      const plants = await db.plants.list({ incluirArchivadas: true })
      const events = await db.events.listRecent()

      const analyses: AiAnalysis[] = []
      const guias: GuiaCuidados[] = []
      for (const planta of plants) {
        analyses.push(...(await db.analyses.listByPlant(planta.id)))
        const guia = await db.guides.get(planta.id)
        if (guia) guias.push(guia)
      }

      const fotos: BackupFile['fotos'] = []
      for (const foto of await fotosEnUso(plants, analyses)) {
        fotos.push({
          id: foto.id,
          mime: foto.mime,
          base64: await blobABase64(foto.blob),
          thumbBase64: await blobABase64(foto.thumb),
          width: foto.width,
          height: foto.height,
        })
      }

      return {
        formato: 'plantapps-backup',
        version: 1,
        exportadoEn: nowIso(),
        plants,
        events,
        analyses,
        guias: guias,
        fotos,
      }
    },

    /**
     * Restaura una copia. En modo `reemplazar` borra antes todo lo que hubiera;
     * en modo `fusionar` conserva lo que ya está y sustituye (sin duplicar) los
     * registros cuyo id ya exista. El informe cuenta los registros escritos.
     */
    async importAll(data: BackupFile | string, modo: ModoImportacion): Promise<ImportReport> {
      const copia = validarCopia(aObjeto(data))

      if (!modoSchema.safeParse(modo).success) {
        throw new Error(`El modo "${String(modo)}" no es válido: usa "reemplazar" o "fusionar".`)
      }

      const crudito = getRawStore(db)
      if (!crudito) {
        throw new Error(
          'Esta base de datos no admite importar copias de seguridad porque no da acceso directo a sus tablas.',
        )
      }

      const fotos: StoredPhoto[] = copia.fotos.map((foto) => {
        const blob = base64ABlob(foto.base64, foto.mime)
        return {
          id: foto.id,
          blob,
          thumb: base64ABlob(foto.thumbBase64, foto.mime),
          mime: foto.mime,
          width: foto.width,
          height: foto.height,
          bytes: blob.size,
          creadoEn: copia.exportadoEn,
        }
      })

      if (modo === 'reemplazar') await crudito.clearAll()

      await crudito.writeAll({
        plants: copia.plants,
        events: copia.events,
        analyses: copia.analyses,
        guias: copia.guias,
        fotos,
      })
      db.notify()

      return {
        plants: copia.plants.length,
        events: copia.events.length,
        analyses: copia.analyses.length,
        guias: copia.guias.length,
        fotos: fotos.length,
      }
    },
  }
}
