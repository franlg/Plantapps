import type {
  AiAnalysis,
  AiAnalysisDraft,
  AppSettings,
  AttentionItem,
  CareEvent,
  ID,
  NewCareEvent,
  NewPlant,
  Plant,
  StoredPhoto,
  WateringStatus,
} from '@/types'
import { SETTINGS_POR_DEFECTO } from '@/types'
import type { Db } from '@/services/contracts'
import { daysSince, nowIso, toIsoDate } from '@/lib/dates'
import { newId } from '@/lib/id'

/** Frecuencia por defecto si la planta no tiene ninguna configurada. */
export const FRECUENCIA_POR_DEFECTO = 7

type Listener = () => void

/**
 * Implementación de `Db` en memoria.
 * Sirve para tests y para developing la interfaz sin depender de IndexedDB.
 * `src/db/index.ts` decide cuál usar en cada entorno.
 */
export function createMemoryDb(): Db {
  const plants = new Map<ID, Plant>()
  const events = new Map<ID, CareEvent>()
  const photos = new Map<ID, StoredPhoto>()
  const analyses = new Map<ID, AiAnalysis>()
  const objectUrls = new Map<ID, string>()
  let settings: AppSettings = { ...SETTINGS_POR_DEFECTO }
  const listeners = new Set<Listener>()
  let version = 0

  const notify = () => {
    version += 1
    for (const l of listeners) l()
  }

  const sortedPlants = (incluirArchivadas: boolean): Plant[] =>
    [...plants.values()]
      .filter((p) => incluirArchivadas || !p.archivada)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const eventsByPlant = (plantId: ID) =>
    [...events.values()]
      .filter((e) => e.plantId === plantId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))

  const ultimoRiego = (plantId: ID): CareEvent | undefined =>
    eventsByPlant(plantId).find((e) => e.tipo === 'riego')

  const analisisByPlant = (plantId: ID) =>
    [...analyses.values()]
      .filter((a) => a.plantId === plantId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))

  const estado = (plantId: ID, now: Date = new Date()): WateringStatus => {
    const plant = plants.get(plantId)
    const riego = ultimoRiego(plantId)
    const diasDesdeRiego = riego ? daysSince(riego.fecha, now) : null
    const frecuencia = plant?.frecuenciaRiegoDias ?? null
    const diasDesdePlantado = plant?.fechaPlantado ? daysSince(plant.fechaPlantado, now) : null

    if (diasDesdeRiego == null) {
      return { plantId, estado: 'nunca_regada', diasDesdeRiego, diasParaRiego: null, diasDesdePlantado, frecuenciaDias: frecuencia }
    }
    const base = frecuencia ?? FRECUENCIA_POR_DEFECTO
    const diasParaRiego = base - diasDesdeRiego
    const estadoRiego: WateringStatus['estado'] =
      diasParaRiego > 1 ? 'al_dia' : diasParaRiego >= 0 ? 'proximo' : 'vencido'
    return { plantId, estado: estadoRiego, diasDesdeRiego, diasParaRiego, diasDesdePlantado, frecuenciaDias: base }
  }

  const db: Db = {
    get version() {
      return version
    },

    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    notify,

    plants: {
      async list(opts) {
        return sortedPlants(opts?.incluirArchivadas ?? false)
      },
      async get(id) {
        return plants.get(id)
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
        plants.set(plant.id, plant)
        notify()
        return plant
      },
      async update(id, patch) {
        const current = plants.get(id)
        if (!current) throw new Error(`No existe la planta ${id}`)
        const next: Plant = { ...current, ...patch, id: current.id, actualizadoEn: nowIso() }
        plants.set(id, next)
        notify()
        return next
      },
      async remove(id) {
        plants.delete(id)
        for (const e of events.values()) if (e.plantId === id) events.delete(e.id)
        for (const a of analyses.values()) if (a.plantId === id) analyses.delete(a.id)
        notify()
      },
      async setFotoPortada(id, photoId) {
        await db.plants.update(id, { fotoPortadaId: photoId })
      },
      async setArchivada(id, archivada) {
        await db.plants.update(id, { archivada })
      },
    },

    events: {
      async listByPlant(plantId, opts) {
        const list = eventsByPlant(plantId)
        return opts?.limite ? list.slice(0, opts.limite) : list
      },
      async listRecent(opts) {
        const list = [...events.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
        return opts?.limite ? list.slice(0, opts.limite) : list
      },
      async create(input: NewCareEvent) {
        const event: CareEvent = { ...input, id: newId(), creadoEn: nowIso() }
        events.set(event.id, event)
        notify()
        return event
      },
      async update(id, patch) {
        const current = events.get(id)
        if (!current) throw new Error(`No existe el evento ${id}`)
        const next = { ...current, ...patch, id: current.id }
        events.set(id, next)
        notify()
        return next
      },
      async remove(id) {
        events.delete(id)
        notify()
      },
      async ultimoRiego(plantId) {
        return ultimoRiego(plantId)
      },
    },

    photos: {
      async get(id) {
        return photos.get(id)
      },
      async put(blob: Blob) {
        const photo: StoredPhoto = {
          id: newId(),
          blob,
          thumb: blob,
          mime: blob.type || 'image/jpeg',
          width: 0,
          height: 0,
          bytes: blob.size,
          creadoEn: nowIso(),
        }
        photos.set(photo.id, photo)
        notify()
        return photo
      },
      async remove(id) {
        photos.delete(id)
        db.photos.release(id)
        notify()
      },
      async url(id) {
        const cached = objectUrls.get(id)
        if (cached) return cached
        const photo = photos.get(id)
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
    },

    analyses: {
      async get(id) {
        return analyses.get(id)
      },
      async listByPlant(plantId) {
        return analisisByPlant(plantId)
      },
      async create(draft: AiAnalysisDraft & { plantId: ID; photoId: ID; modelo: string; raw?: string }) {
        const analysis: AiAnalysis = {
          ...draft,
          frecuenciaRiegoDias: draft.frecuenciaRiegoDias ?? null,
          id: newId(),
          fecha: nowIso(),
        }
        analyses.set(analysis.id, analysis)
        notify()
        return analysis
      },
      async ultimo(plantId) {
        return analisisByPlant(plantId)[0]
      },
      async remove(id) {
        analyses.delete(id)
        notify()
      },
    },

    settings: {
      async get() {
        return settings
      },
      async save(patch) {
        settings = { ...settings, ...patch }
        notify()
        return settings
      },
    },

    reminders: {
      async estado(plantId, now) {
        return estado(plantId, now)
      },
      async attention(opts) {
        const items: AttentionItem[] = []
        for (const plant of sortedPlants(false)) {
          const s = estado(plant.id)
          if (s.estado === 'vencido') {
            items.push({
              plantId: plant.id,
              plantNombre: plant.nombre,
              motivo: 'riego_vencido',
              detalle: `Lleva ${s.diasDesdeRiego} días sin regar`,
              prioridad: 0,
            })
          } else if (s.estado === 'nunca_regada') {
            items.push({
              plantId: plant.id,
              plantNombre: plant.nombre,
              motivo: 'nunca_regada',
              detalle: 'Nunca se ha registrado un riego',
              prioridad: 1,
            })
          } else if (s.estado === 'proximo') {
            items.push({
              plantId: plant.id,
              plantNombre: plant.nombre,
              motivo: 'riego_proximo',
              detalle: s.diasDesdeRiego != null ? `Toca regar en ${s.diasDesdeRiego} días` : 'Toca regar pronto',
              prioridad: 2,
            })
          }
          const ultimoAnalisis = analisisByPlant(plant.id)[0]
          if (ultimoAnalisis && (ultimoAnalisis.veredicto === 'problema' || ultimoAnalisis.gravedad === 'grave')) {
            items.push({
              plantId: plant.id,
              plantNombre: plant.nombre,
              motivo: 'analisis_problema',
              detalle: ultimoAnalisis.problema || ultimoAnalisis.accionPrincipal,
              prioridad: 0,
            })
          }
        }
        items.sort((a, b) => a.prioridad - b.prioridad || a.plantNombre.localeCompare(b.plantNombre, 'es'))
        return opts?.limite ? items.slice(0, opts.limite) : items
      },
    },

    async clear() {
      plants.clear()
      events.clear()
      analyses.clear()
      for (const id of [...photos.keys()]) db.photos.release(id)
      photos.clear()
      settings = { ...SETTINGS_POR_DEFECTO }
      notify()
    },
  }

  return db
}

/** Solo para tests: fecha de referencia para el estado de riego. */
export function estadoDeReferencia(fecha: string): string {
  return toIsoDate(fecha)
}