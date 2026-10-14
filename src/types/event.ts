import type { ID } from './plant'

/** Tipos de registro del historial de una planta. */
export type TipoEvento = 'riego' | 'fertilizacion' | 'trasplanto' | 'poda' | 'comentario' | 'analisis'

export const TIPOS_EVENTO: TipoEvento[] = [
  'riego',
  'fertilizacion',
  'trasplanto',
  'poda',
  'comentario',
  'analisis',
]

export const EVENTO_LABELS: Record<TipoEvento, string> = {
  riego: 'Riego',
  fertilizacion: 'Fertilización',
  trasplanto: 'Trasplante',
  poda: 'Poda',
  comentario: 'Comentario',
  analisis: 'Análisis IA',
}

export const EVENTO_EMOJI: Record<TipoEvento, string> = {
  riego: '💧',
  fertilizacion: '🌱',
  trasplanto: '🪴',
  poda: '✂️',
  comentario: '📝',
  analisis: '🤖',
}

/** Un evento del historial: un riego, un comentario con fecha, un análisis... */
export interface CareEvent {
  id: ID
  plantId: ID
  tipo: TipoEvento
  /** Cuándo ocurrió, ISO datetime. Puede ser una fecha pasada (registro retroactivo). */
  fecha: string
  /** Texto libre. */
  nota?: string
  /** Si tipo === 'analisis', referencia al análisis de IA asociado. */
  analysisId?: ID
  /** Para riegos: litros o ml aproximados. Opcional. */
  cantidad?: string
  /** ISO datetime de creación del registro. */
  creadoEn: string
}

/** Campos que puede rellenar el usuario al crear un evento. */
export type NewCareEvent = Omit<CareEvent, 'id' | 'creadoEn'>