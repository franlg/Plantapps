import type { ID } from './plant'

/** Qué hacer con la planta según el análisis de la foto. */
export type Veredicto = 'regar' | 'no_regar' | 'trasplantar' | 'problema' | 'todo_ok'

export const VEREDICTO_LABELS: Record<Veredicto, string> = {
  regar: 'Regar',
  no_regar: 'No regar',
  trasplantar: 'Trasplantar',
  problema: 'Tiene un problema',
  todo_ok: 'Todo correcto',
}

export const VEREDICTO_EMOJI: Record<Veredicto, string> = {
  regar: '💧',
  no_regar: '🙂',
  trasplantar: '🪴',
  problema: '⚠️',
  todo_ok: '✅',
}

/** Cuánto se fía el modelo de su propio diagnóstico. */
export type Confianza = 'alta' | 'media' | 'baja'

export type Gravedad = 'ninguna' | 'leve' | 'moderada' | 'grave'

export const GRAVEDAD_LABELS: Record<Gravedad, string> = {
  ninguna: 'Nada grave',
  leve: 'Leve',
  moderada: 'Moderada',
  grave: 'Grave',
}

/**
 * Contexto que se le manda al modelo junto con la foto.
 * Sin esto el modelo solo ve hojas y no sabe si toca regar.
 */
export interface PlantContext {
  nombre: string
  especie?: string
  diasDesdePlantado: number | null
  maceta?: string
  ubicacion?: string
  luz?: string
  notas?: string
  /** ISO datetime del último riego, o null si nunca se ha regado. */
  ultimoRiego: string | null
  diasDesdeUltimoRiego: number | null
  /** Frecuencia objetivo configurada por el usuario. */
  frecuenciaRiegoDias: number | null
  /** Resumen textual de los últimos eventos, para que el modelo tenga contexto. */
  historial: string[]
}

/** Entrada del servicio de IA. */
export interface AiAnalyzeInput {
  plantId: ID
  /** Foto de la planta (JPEG/PNG, ya comprimida). */
  foto: Blob
  contexto: PlantContext
  /** Modelo a usar; si no, el de ajustes. */
  modelo?: string
  /**
   * Foto del análisis anterior. Si se pasa junto con `comparar`, el modelo mira
   * las dos y dice si la planta ha mejorado, sigue igual o ha empeorado.
   */
  fotoAnterior?: Blob
  /** Pedir explícitamente la comparación entre las dos fotos. */
  comparar?: boolean
  /**
   * Cuándo se hizo la foto anterior, ISO. Si no viene, el modelo solo sabe que
   * "fue hace un tiempo", y no puede decir "ha mejorado desde hace 2 meses".
   */
  fechaAnterior?: string
}

/** Cómo ha evolucionado la planta respecto a la última foto. */
export type Tendencia = 'mejor' | 'igual' | 'peor'

export interface ComparacionIa {
  tendencia: Tendencia
  /** Qué ha cambiado, en lenguaje sencillo. */
  detalle: string
  /** `false` si no había foto anterior con la que comparar. */
  habiaAnterior: boolean
}

export const TENDENCIA_LABELS: Record<Tendencia, string> = {
  mejor: 'Ha mejorado',
  igual: 'Sigue igual',
  peor: 'Ha empeorado',
}

/** Lo que devuelve el modelo (validado con Zod antes de persistirlo). */
export interface AiAnalysisDraft {
  veredicto: Veredicto
  /** 0-100. */
  salud: number
  /** Acción principal, imperativo y corta: "Riega en profundidad esta semana". */
  accionPrincipal: string
  regar: boolean
  /** Días entre riegos que recomienda el modelo. */
  frecuenciaRiegoDias: number | null
  problema?: string
  gravedad?: Gravedad
  /** Signos observables: "hojas amarillas en la base". */
  sintomas: string[]
  /** Qué hacer: "mover a media sombra", "abonar con dilutedor". */
  recomendaciones: string[]
  confianza: Confianza
  /** 1-3 frases para leer de un vistazo. */
  resumen: string
  /** Comparación con la foto anterior, solo si se pidió y había foto previa. */
  comparacion?: ComparacionIa
}

/** Análisis guardado, con foto y modelo usados. */
export interface AiAnalysis extends AiAnalysisDraft {
  id: ID
  plantId: ID
  photoId: ID
  /** Cuándo se hizo el análisis, ISO datetime. */
  fecha: string
  modelo: string
  /** Respuesta cruda del modelo, para depurar. */
  raw?: string
}

/** Causa del fallo de un análisis. */
export type AiErrorCode =
  | 'sin_clave'
  | 'sin_red'
  | 'cuota'
  | 'modelo_no_disponible'
  | 'respuesta_invalida'
  | 'desconocido'

/** Error de negocio de la capa de IA (quota, red, clave ausente...). */
export class AiError extends Error {
  readonly codigo: AiErrorCode

  constructor(message: string, codigo: AiErrorCode) {
    super(message)
    this.name = 'AiError'
    this.codigo = codigo
  }
}