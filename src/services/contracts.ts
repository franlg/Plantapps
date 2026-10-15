import type {
  AiAnalysis,
  AiAnalysisDraft,
  AiAnalyzeInput,
  AppSettings,
  AttentionItem,
  CareEvent,
  GuiaCuidados,
  GuiaCuidadosDraft,
  GuiaInput,
  ID,
  IdentificacionDraft,
  IdentificarInput,
  NewCareEvent,
  NewPlant,
  Plant,
  StoredPhoto,
  WateringStatus,
} from '@/types'

/**
 * CONTRATOS DE LA CAPA DE DATOS
 * ============================
 * La interfaz `Db` es la frontera entre la app y el almacenamiento.
 * Hay dos implementaciones: una en memoria (tests, F0) y otra con IndexedDB/Dexie (producción).
 * Ninguna de las dos conoce React.
 */

export interface PlantRepo {
  list(opts?: { incluirArchivadas?: boolean }): Promise<Plant[]>
  get(id: ID): Promise<Plant | undefined>
  create(input: NewPlant): Promise<Plant>
  update(id: ID, patch: Partial<Plant>): Promise<Plant>
  remove(id: ID): Promise<void>
  setFotoPortada(id: ID, photoId: ID | undefined): Promise<void>
  setArchivada(id: ID, archivada: boolean): Promise<void>
}

export interface EventRepo {
  /** Eventos de una planta, más recientes primero. */
  listByPlant(plantId: ID, opts?: { limite?: number }): Promise<CareEvent[]>
  /** Últimos eventos de todas las plantas. */
  listRecent(opts?: { limite?: number }): Promise<CareEvent[]>
  create(input: NewCareEvent): Promise<CareEvent>
  update(id: ID, patch: Partial<CareEvent>): Promise<CareEvent>
  remove(id: ID): Promise<void>
  /** Último riego registrado de una planta, o undefined. */
  ultimoRiego(plantId: ID): Promise<CareEvent | undefined>
}

export interface PhotoRepo {
  get(id: ID): Promise<StoredPhoto | undefined>
  /**
   * Almacena una foto ya comprimida.
   * `extra` permite persistir también la miniatura y las medidas reales; si no se
   * pasan, la miniatura es el propio blob y width/height valen 0.
   */
  put(blob: Blob, extra?: { thumb?: Blob; width?: number; height?: number }): Promise<StoredPhoto>
  remove(id: ID): Promise<void>
  /** ObjectURL para mostrar la imagen. Hay que llamar a release() cuando se deja de usar. */
  url(id: ID): Promise<string | undefined>
  release(id: ID): void
}

export interface AnalysisRepo {
  get(id: ID): Promise<AiAnalysis | undefined>
  listByPlant(plantId: ID): Promise<AiAnalysis[]>
  create(draft: AiAnalysisDraft & { plantId: ID; photoId: ID; modelo: string; raw?: string }): Promise<AiAnalysis>
  /** último análisis de una planta, el más reciente. */
  ultimo(plantId: ID): Promise<AiAnalysis | undefined>
  remove(id: ID): Promise<void>
}

/** Una guía de cuidados por planta. Como mucho una vigente a la vez. */
export interface GuideRepo {
  /** Guía vigente de una planta, o undefined si nunca se ha pedido. */
  get(plantId: ID): Promise<GuiaCuidados | undefined>
  /** Guarda una guía. Sustituye a la anterior si la había. */
  create(draft: GuiaCuidadosDraft & { plantId: ID; modelo: string }): Promise<GuiaCuidados>
  /** Borra la guía de una planta. No lanza si no había ninguna. */
  remove(plantId: ID): Promise<void>
}

export interface SettingsRepo {
  get(): Promise<AppSettings>
  save(patch: Partial<AppSettings>): Promise<AppSettings>
}

/** Motor de recordatorios de riego. */
export interface ReminderService {
  /** Estado del riego de una planta concreta. */
  estado(plantId: ID, now?: Date): Promise<WateringStatus>
  /** Plantas que requieren atención, ordenadas por urgencia. */
  attention(opts?: { limite?: number }): Promise<AttentionItem[]>
}

export interface Db {
  plants: PlantRepo
  events: EventRepo
  photos: PhotoRepo
  analyses: AnalysisRepo
  guides: GuideRepo
  settings: SettingsRepo
  reminders: ReminderService

  /** Versión de los datos; sube con cada escritura. Permite usar useSyncExternalStore. */
  readonly version: number
  /** Se suscribe a los cambios. Devuelve la función para cancelar la suscripción. */
  subscribe(listener: () => void): () => void
  /** Fuerza una notificación (ya la lanzan las escrituras). */
  notify(): void
  /** Borra todos los datos (Ajustes). */
  clear(): Promise<void>
}

/** Servicio de IA. Puede fallar con AiError. */
export interface AiService {
  isConfigured(): boolean
  analyze(input: AiAnalyzeInput): Promise<AiAnalysisDraft>
  /** Guía de cuidados por secciones, con la planta como contexto. */
  generarGuia(input: GuiaInput): Promise<GuiaCuidadosDraft>
  /** Identifica la especie a partir de una foto. `especie: null` si no puede. */
  identificar(input: IdentificarInput): Promise<IdentificacionDraft>
}

/** Copia de seguridad completa en un único archivo JSON. */
export interface BackupFile {
  formato: 'plantapps-backup'
  version: 1
  exportadoEn: string
  plants: Plant[]
  events: CareEvent[]
  analyses: AiAnalysis[]
  /** Guías de cuidados, una por planta como mucho. */
  guias: GuiaCuidados[]
  /** Fotos en base64 (sin el prefijo data:). */
  fotos: Array<{ id: ID; mime: string; base64: string; thumbBase64: string; width: number; height: number }>
}

export interface ImportReport {
  plants: number
  events: number
  analyses: number
  guias: number
  fotos: number
}

/** Servicio de copia de seguridad. */
export interface BackupService {
  exportAll(): Promise<BackupFile>
  /** Importa una copia. `modo: 'reemplazar' | 'fusionar'` (merge por id). */
  importAll(data: BackupFile, modo: 'reemplazar' | 'fusionar'): Promise<ImportReport>
}