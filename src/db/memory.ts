import type {
  AiAnalysis,
  AiAnalysisDraft,
  AppSettings,
  CareEvent,
  GuiaCuidados,
  GuiaCuidadosDraft,
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
import { SETTINGS_POR_DEFECTO } from '@/types'
import { createReminderService } from '@/services/reminders'
import { nowIso } from '@/lib/dates'
import { newId } from '@/lib/id'

type Listener = () => void

/**
 * Implementación de `Db` en memoria.
 * Sirve para tests y para desarrollar la interfaz sin depender de IndexedDB.
 * `src/db/index.ts` decide cuál usar en cada entorno.
 */
export function createMemoryDb(): Db {
  const plants = new Map<ID, Plant>()
  const events = new Map<ID, CareEvent>()
  const photos = new Map<ID, StoredPhoto>()
  const analyses = new Map<ID, AiAnalysis>()
  /** Una guía vigente por planta. */
  const guias = new Map<ID, GuiaCuidados>()
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

  const analisisByPlant = (plantId: ID) =>
    [...analyses.values()]
      .filter((a) => a.plantId === plantId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))

  const plantsRepo: PlantRepo = {
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
      guias.delete(id)
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
      const next: CareEvent = { ...current, ...patch, id: current.id }
      events.set(id, next)
      notify()
      return next
    },
    async remove(id) {
      events.delete(id)
      notify()
    },
    async ultimoRiego(plantId) {
      return eventsByPlant(plantId).find((e) => e.tipo === 'riego')
    },
  }

  const photosRepo: PhotoRepo = {
    async get(id) {
      return photos.get(id)
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
      photos.set(photo.id, photo)
      notify()
      return photo
    },
    async remove(id) {
      photos.delete(id)
      photosRepo.release(id)
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
  }

  const analysesRepo: AnalysisRepo = {
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
  }

  const guidesRepo: GuideRepo = {
    async get(plantId) {
      return guias.get(plantId)
    },
    async create(draft: GuiaCuidadosDraft & { plantId: ID; modelo: string }) {
      const guia: GuiaCuidados = { ...draft, id: newId(), generadoEn: nowIso() }
      guias.set(guia.plantId, guia)
      notify()
      return guia
    },
    async remove(plantId) {
      guias.delete(plantId)
      notify()
    },
  }

  const settingsRepo: SettingsRepo = {
    async get() {
      return settings
    },
    async save(patch) {
      settings = { ...settings, ...patch }
      notify()
      return settings
    },
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
      plants.clear()
      events.clear()
      analyses.clear()
      guias.clear()
      for (const id of [...photos.keys()]) photosRepo.release(id)
      photos.clear()
      settings = { ...SETTINGS_POR_DEFECTO }
      notify()
    },
  }

  return db
}