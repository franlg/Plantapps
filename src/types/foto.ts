import type { ID } from './plant'
import type { Veredicto } from './ai'

/**
 * Una foto del historial visual de una planta.
 *
 * La app ya guarda una foto por análisis y una de portada: esto las ordena para
 * poder ver la evolución de la planta sin duplicar datos.
 */
export interface FotoProgreso {
  /** Id de la foto en `db.photos`. */
  id: ID
  /**
   * Cuándo es "de" esta foto: para un análisis, el día del análisis; para la
   * portada, el día en que se subió.
   */
  fecha: string
  origen: 'portada' | 'analisis'
  /** Análisis al que pertenece, si es de un análisis. */
  analysisId?: ID
  /** El veredicto de ese análisis, para marcar si estaba sana o no. */
  veredicto?: Veredicto
}