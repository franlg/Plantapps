import type { ID } from './plant'
import type { CareEvent } from './event'
import type { AiAnalysis } from './ai'

/** Ajustes de la aplicación, guardados solo en este dispositivo. */
export interface AppSettings {
  /** Clave de Gemini. Nunca se sube a ningún servidor: vive en el móvil. */
  apiKey?: string
  /** Modelo por defecto. */
  modelo: string
  /** Modelo de respaldo si el principal falla o agota cuota. */
  modeloFallback: string
  /** ISO datetime de la última copia de seguridad exportada. */
  ultimaCopia?: string
}

export const SETTINGS_POR_DEFECTO: AppSettings = {
  // Verificados contra la API el 14/10/2026 con una clave del nivel gratuito:
  //   gemini-3.8-flash devolvía 503 "high demand", así que se usa 3.6-flash como principal.
  modelo: 'gemini-3.6-flash',
  // El más estable y barato del nivel gratuito.
  modeloFallback: 'gemini-3.5-flash-lite',
}

/** Modelos del nivel gratuito conocidos, para el selector de Ajustes. */
export const MODELOS_GRATUITOS = [
  { id: 'gemini-3.6-flash', nombre: 'Gemini 3.6 Flash (recomendado)' },
  { id: 'gemini-3.5-flash-lite', nombre: 'Gemini 3.5 Flash Lite (más ligero)' },
  { id: 'gemini-3.8-flash', nombre: 'Gemini 3.8 Flash (a veces saturado)' },
]

/** Estado del riego de una planta. */
export type EstadoRiego = 'nunca_regada' | 'al_dia' | 'proximo' | 'vencido'

export const ESTADO_REGIO_LABELS: Record<EstadoRiego, string> = {
  nunca_regada: 'Nunca regada',
  al_dia: 'Al día',
  proximo: 'Toca pronto',
  vencido: 'Riego vencido',
}

export interface WateringStatus {
  plantId: ID
  estado: EstadoRiego
  diasDesdeRiego: number | null
  /** Negativo = días de retraso. */
  diasParaRiego: number | null
  diasDesdePlantado: number | null
  frecuenciaDias: number | null
}

/** Una planta que requiere atención, para el panel de inicio. */
export interface AttentionItem {
  plantId: ID
  plantNombre: string
  motivo: 'riego_vencido' | 'riego_proximo' | 'analisis_problema' | 'nunca_regada'
  detalle: string
  /** Urgencia para ordenar la lista: 0 = más urgente. */
  prioridad: number
}

/** Fila del historial con datos de la planta ya resueltos. */
export interface TimelineEntry {
  event: CareEvent
  plantNombre: string
  plant?: { id: ID; nombre: string; fotoPortadaId?: ID }
  analysis?: AiAnalysis
}