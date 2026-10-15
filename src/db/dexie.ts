import Dexie from 'dexie'
import type { Collection, Table } from 'dexie'
import type {
  AiAnalysis,
  AiAnalysisDraft,
  AppSettings,
  CareEvent,
  GuiaCuidados,
  ID,
  NewCareEvent,
  NewPlant,
  Plant,
  StoredPhoto,
} from '@/types'
import type {
  AnalysisRepo,
  Db,
  EventRepo,
  GuideRepo,
  PhotoRepo,
  PlantRepo,
  SettingsRepo,
} from '@/services/contracts'
import type { RawSnapshot, RawStore } from './backup'
import { SETTINGS_POR_DEFECTO } from '@/types'
import { createReminderService } from '@/services/reminders'
import { attachRawStore } from './backup'
import { nowIso } from '@/lib/dates'
import { newId } from '@/lib/id'

type Listener = () => void

/** Fila de la tabla `settings`: un único documento con clave fija. */
interface SettingsRow {
  clave: string
  valor: AppSettings
}

/** Clave del documento de ajustes dentro de la tabla `settings`. */
const CLAVE_AJUSTES = 'app'

/** Nombre por defecto de la base de datos en el dispositivo. */
const NOMBRE_POR_DEFECTO = 'plantapps'

/**
 * Índices de cada tabla. La clave primaria es `id` en todas menos en `settings`,
 * que usa `clave`. `[plantId+fecha]` es el índice compuesto que da el historial
 * de una planta ya ordenado de más reciente a más antiguo.
 *
 * Este es el esquema de la **versión 1**, el que se publicó. Se declara tal cual
 * para que Dexie lo compare al abrir una base ya existente: si no coincidiera,
 * Dexie crearía las tablas que faltaran o borraría las que sobraran.
 */
const ESQUEMA_V1 = {
  plants: 'id, nombre, archivada',
  events: 'id, plantId, fecha, [plantId+fecha]',
  photos: 'id',
  analyses: 'id, plantId, fecha, [plantId+fecha]',
  settings: 'clave',
}

/**
 * Esquema de la **versión 2**: exactamente el de la v1 más la tabla `guides`.
 *
 * La clave primaria sigue siendo `id` (el de la propia guía) y `plantId` es un
 * índice: así una copia de seguridad restaura cada guía por su id y, a la vez,
 * se localiza la guía vigente de una planta sin recorrer la tabla. La regla de
 * "una planta, una guía vigente" la respeta `guidesRepo`, no el esquema.
 */
const ESQUEMA_V2 = {
  ...ESQUEMA_V1,
  guides: 'id, plantId',
}

/** Conexión con la base y las seis tablas tipadas. */
interface Conexion {
  instance: Dexie
  plants: Table<Plant, ID>
  events: Table<CareEvent, ID>
  photos: Table<StoredPhoto, ID>
  analyses: Table<AiAnalysis, ID>
  guides: Table<GuiaCuidados, ID>
  settings: Table<SettingsRow, string>
}

function abrir(nombreBd: string): Conexion {
  const instance = new Dexie(nombreBd)
  instance.version(1).stores(ESQUEMA_V1)
  instance
    .version(2)
    .stores(ESQUEMA_V2)
    .upgrade(() => {
      // La migración de la v1 a la v2 SOLO añade la tabla `guides`. No se borra
      // ni se reescribe ni una fila de plantas, eventos, análisis, fotos o
      // ajustes: los datos del usuario se quedan exactamente como estaban.
    })
  return {
    instance,
    plants: instance.table<Plant, ID>('plants'),
    events: instance.table<CareEvent, ID>('events'),
    photos: instance.table<StoredPhoto, ID>('photos'),
    analyses: instance.table<AiAnalysis, ID>('analyses'),
    guides: instance.table<GuiaCuidados, ID>('guides'),
    settings: instance.table<SettingsRow, string>('settings'),
  }
}

/** Rango del índice compuesto `[plantId+fecha]` limitado a una planta. */
function rangoDePlanta<T>(tabla: Table<T, ID>, indice: string, plantId: ID): Collection<T, ID> {
  return tabla
    .where(indice)
    .between([plantId, Dexie.minKey], [plantId, Dexie.maxKey])
}

/** Orden cronológico inverso, el mismo que usa la implementación en memoria. */
function masRecientePrimero<T extends { fecha: string }>(a: T, b: T): number {
  return b.fecha.localeCompare(a.fecha)
}

/**
 * Implementación de `Db` sobre IndexedDB con Dexie.
 *
 * Se comporta exactamente igual que la de memoria (mismo orden, mismo borrado en
 * cascada, mismo contador de versión), con la diferencia de que los datos, las
 * fotos y las guías de cuidados sobreviven a la recarga.
 * `src/db/index.ts` decide cuál usar en cada entorno.
 */
export function createIndexedDb(nombreBd: string = NOMBRE_POR_DEFECTO): Db {
  const {
    instance,
    plants: plantasT,
    events: eventosT,
    photos: fotosT,
    analyses: analisisT,
    guides: guiasT,
    settings: ajustesT,
  } = abrir(nombreBd)

  const objectUrls = new Map<ID, string>()
  const listeners = new Set<Listener>()
  let version = 0

  const notify = () => {
    version += 1
    for (const l of listeners) l()
  }

  const plantsRepo: PlantRepo = {
    async list(opts) {
      const incluirArchivadas = opts?.incluirArchivadas ?? false
      const todas = await plantasT.toArray()
      return todas
        .filter((p) => incluirArchivadas || !p.archivada)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    },
    async get(id) {
      return plantasT.get(id)
    },
    async create(input: NewPlant) {
      const ts = nowIso()
      const plant: Plant = {
        archivada: false,
        ...input,
        id: newId(),
        creadoEn: ts,
        actualizadoEn: ts,
      }
      await plantasT.add(plant)
      notify()
      return plant
    },
    async update(id, patch) {
      const current = await plantasT.get(id)
      if (!current) throw new Error(`No existe la planta ${id}`)
      const next: Plant = { ...current, ...patch, id: current.id, actualizadoEn: nowIso() }
      await plantasT.put(next)
      notify()
      return next
    },
    async remove(id) {
      await instance.transaction('rw', plantasT, eventosT, analisisT, guiasT, async () => {
        await plantasT.delete(id)
        await eventosT.where('plantId').equals(id).delete()
        await analisisT.where('plantId').equals(id).delete()
        await guiasT.where('plantId').equals(id).delete()
      })
      notify()
    },
    async setFotoPortada(id, photoId) {
      await plantsRepo.update(id, { fotoPortadaId: photoId })
    },
    async setArchivada(id, archivada) {
      await plantsRepo.update(id, { archivada })
    },
  }

  const eventsRepo: EventRepo = {
    async listByPlant(plantId, opts) {
      const list = (await rangoDePlanta(eventosT, '[plantId+fecha]', plantId).toArray()).sort(masRecientePrimero)
      return opts?.limite ? list.slice(0, opts.limite) : list
    },
    async listRecent(opts) {
      const list = (await eventosT.toArray()).sort(masRecientePrimero)
      return opts?.limite ? list.slice(0, opts.limite) : list
    },
    async create(input: NewCareEvent) {
      const event: CareEvent = { ...input, id: newId(), creadoEn: nowIso() }
      await eventosT.add(event)
      notify()
      return event
    },
    async update(id, patch) {
      const current = await eventosT.get(id)
      if (!current) throw new Error(`No existe el evento ${id}`)
      const next: CareEvent = { ...current, ...patch, id: current.id }
      await eventosT.put(next)
      notify()
      return next
    },
    async remove(id) {
      await eventosT.delete(id)
      notify()
    },
    async ultimoRiego(plantId) {
      const riegos = (await rangoDePlanta(eventosT, '[plantId+fecha]', plantId)
        .filter((e) => e.tipo === 'riego')
        .toArray()).sort(masRecientePrimero)
      return riegos[0]
    },
  }

  const photosRepo: PhotoRepo = {
    async get(id) {
      return fotosT.get(id)
    },
    // MARCADOR: `byIds` en Dexie lo implementa el agente de datos.
    async byIds(ids) {
      const salida: StoredPhoto[] = []
      for (const id of ids) {
        const foto = await fotosT.get(id)
        if (foto) salida.push(foto)
      }
      return salida
    },
    async put(blob: Blob, extra) {
      const photo: StoredPhoto = {
        id: newId(),
        blob,
        thumb: extra?.thumb ?? blob,
        mime: blob.type || 'image/jpeg',
        width: extra?.width ?? 0,
        height: extra?.height ?? 0,
        bytes: blob.size,
        creadoEn: nowIso(),
      }
      await fotosT.add(photo)
      notify()
      return photo
    },
    async remove(id) {
      await fotosT.delete(id)
      photosRepo.release(id)
      notify()
    },
    async url(id) {
      const cached = objectUrls.get(id)
      if (cached) return cached
      const photo = await fotosT.get(id)
      if (!photo) return undefined
      const url = URL.createObjectURL(photo.blob)
      objectUrls.set(id, url)
      return url
    },
    release(id) {
      const url = objectUrls.get(id)
      if (!url) return
      URL.revokeObjectURL(url)
      objectUrls.delete(id)
    },
  }

  const analysesRepo: AnalysisRepo = {
    async get(id) {
      return analisisT.get(id)
    },
    async listByPlant(plantId) {
      return (await rangoDePlanta(analisisT, '[plantId+fecha]', plantId).toArray()).sort(masRecientePrimero)
    },
    async create(draft: AiAnalysisDraft & { plantId: ID; photoId: ID; modelo: string; raw?: string }) {
      const analysis: AiAnalysis = {
        ...draft,
        frecuenciaRiegoDias: draft.frecuenciaRiegoDias ?? null,
        id: newId(),
        fecha: nowIso(),
      }
      await analisisT.add(analysis)
      notify()
      return analysis
    },
    async ultimo(plantId) {
      const list = await analysesRepo.listByPlant(plantId)
      return list[0]
    },
    async remove(id) {
      await analisisT.delete(id)
      notify()
    },
  }

  /**
   * Una guía vigente por planta, guardada en la tabla `guides`.
   *
   * La clave primaria es el `id` de la guía (para que una copia de seguridad la
   * restaure tal cual) y `plantId` es un índice. Como el contrato dice que una
   * planta solo tiene una guía vigente, `create` borra la anterior de esa misma
   * planta antes de escribir la nueva, dentro de una transacción: si algo
   * fallara, la planta se quedaría con su guía de siempre.
   */
  const guidesRepo: GuideRepo = {
    async get(plantId) {
      return guiasT.where('plantId').equals(plantId).first()
    },
    async create(draft) {
      const guia: GuiaCuidados = { ...draft, id: newId(), generadoEn: nowIso() }
      await instance.transaction('rw', guiasT, async () => {
        await guiasT.where('plantId').equals(guia.plantId).delete()
        await guiasT.put(guia)
      })
      notify()
      return guia
    },
    async remove(plantId) {
      await guiasT.where('plantId').equals(plantId).delete()
      notify()
    },
  }

  const settingsRepo: SettingsRepo = {
    async get() {
      const row = await ajustesT.get(CLAVE_AJUSTES)
      return row?.valor ?? { ...SETTINGS_POR_DEFECTO }
    },
    async save(patch) {
      const valor: AppSettings = { ...(await settingsRepo.get()), ...patch }
      await ajustesT.put({ clave: CLAVE_AJUSTES, valor })
      notify()
      return valor
    },
  }

  /** Vacía todas las tablas y suelta las URL de imagen generadas. */
  async function limpiar(): Promise<void> {
    const todas = [plantasT, eventosT, fotosT, analisisT, guiasT, ajustesT]
    await instance.transaction('rw', todas, async () => {
      await plantasT.clear()
      await eventosT.clear()
      await analisisT.clear()
      await fotosT.clear()
      await guiasT.clear()
      await ajustesT.clear()
    })
    for (const [id, url] of objectUrls) {
      URL.revokeObjectURL(url)
      objectUrls.delete(id)
    }
  }

  const db: Db = {
    get version() {
      return version
    },

    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    notify,

    plants: plantsRepo,
    events: eventsRepo,
    photos: photosRepo,
    analyses: analysesRepo,
    guides: guidesRepo,
    settings: settingsRepo,

    reminders: createReminderService({
      plants: plantsRepo,
      events: eventsRepo,
      analyses: analysesRepo,
    }),

    async clear() {
      await limpiar()
      notify()
    },
  }

  /**
   * Acceso directo al almacén para el servicio de copias de seguridad: la interfaz
   * `Db` solo sabe crear registros con id nuevo y, al importar, hay que conservar
   * los ids y las marcas de tiempo originales. Ver `src/db/backup.ts`.
   */
  const rawStore: RawStore = {
    async writeAll({ plants, events, analyses, guias, fotos }: RawSnapshot) {
      await instance.transaction('rw', plantasT, eventosT, fotosT, analisisT, guiasT, async () => {
        for (const foto of fotos) await fotosT.put(foto)
        for (const analisis of analyses) await analisisT.put(analisis)
        for (const evento of events) await eventosT.put(evento)
        for (const guia of guias) {
          // Igual que en `guides.create`: la guía que entra sustituye a la que
          // hubiera de esa planta, así que un "fusionar" tampoco deja dos guías
          // vigentes para la misma planta.
          await guiasT.where('plantId').equals(guia.plantId).delete()
          await guiasT.put(guia)
        }
        for (const planta of plants) await plantasT.put(planta)
      })
    },
    clearAll: limpiar,
  }
  attachRawStore(db, rawStore)

  return db
}
