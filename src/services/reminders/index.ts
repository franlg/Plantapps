import type { AnalysisRepo, EventRepo, PlantRepo, ReminderService } from '@/services/contracts'
import type { AiAnalysis, AttentionItem, EstadoRiego, Plant, WateringStatus } from '@/types'
import { daysLabel, daysSince } from '@/lib/dates'
import { FRECUENCIA_POR_DEFECTO, frecuenciaSugerida } from './especies'

export { FRECUENCIA_POR_DEFECTO, frecuenciaSugerida, normalizarEspecie } from './especies'

/**
 * Margen para avisar: cuando al riego le quedan 2 días o menos, la planta sale
 * en 'requiere atención'. Dos días dan margen a verlo sin llegar tarde.
 */
const UMBRAL_PROXIMO = 2

/**
 * Prioridad de `AttentionItem`: menor número = más urgente.
 * Las bandas están separadas por saltos de 100 para que un motivo nuevo no
 * rompa el orden de los que ya existen.
 *
 * - riego_vencido     → negativo, y más negativo cuanto más días de retraso: el
 *                       retraso manda, manda por encima de todo lo demás.
 * - analisis_problema → 100 (grave) / 110 (moderada).
 * - nunca_regada     → 200.
 * - riego_proximo    → 300 + días que faltan (lo más inminente primero).
 */
const PRIO_ANALISIS = 100
const PRIO_NUNCA_REGADA = 200
const PRIO_PROXIMO = 300

/** Desempate estable cuando dos plantas tienen la misma urgencia. */
const ORDEN_MOTIVO: Record<AttentionItem['motivo'], number> = {
  riego_vencido: 0,
  analisis_problema: 1,
  nunca_regada: 2,
  riego_proximo: 3,
}

/**
 * Dependencias mínimas del motor de recordatorios.
 * Al no depender de `Db` completa, tanto la base en memoria como la de
 * IndexedDB pueden reutilizarlo sin referencias circulares.
 */
export interface ReminderDeps {
  plants: PlantRepo
  events: EventRepo
  analyses: AnalysisRepo
}

/**
 * Normaliza cualquier número de días: entero y nunca menor de 1.
 * Una frecuencia de 0 o negativa no debe dejar la planta sin riego para siempre.
 */
function aDias(valor: number): number {
  return Math.max(1, Math.round(valor))
}

/**
 * Días entre riegos con los que comparar a la planta.
 * Siempre gana lo que escribió el usuario; si no puso nada, se deduce de la
 * especie (con el ajuste estacional del mes) y, en último caso, el valor por defecto.
 */
function frecuenciaDe(plant: Plant | undefined, now: Date): number | null {
  if (!plant) return null
  const configurada = plant.frecuenciaRiegoDias
  if (configurada != null && Number.isFinite(configurada) && configurada > 0) {
    return aDias(configurada)
  }
  return frecuenciaSugerida(plant.especie, now.getMonth() + 1) ?? FRECUENCIA_POR_DEFECTO
}

function detalleVencido(diasDesdeRiego: number | null): string {
  if (diasDesdeRiego == null) return 'Se le pasó la fecha de riego'
  return `Lleva ${daysLabel(diasDesdeRiego)} sin regar`
}

function detalleNuncaRegada(diasDesdePlantado: number | null): string {
  if (diasDesdePlantado != null && diasDesdePlantado > 0) {
    return `Sin un solo riego en ${daysLabel(diasDesdePlantado)} desde que la plantaste`
  }
  return 'Nunca se ha registrado un riego'
}

function detalleProximo(diasParaRiego: number | null): string {
  if (diasParaRiego == null) return 'Toca regar pronto'
  if (diasParaRiego <= 0) return 'Toca regar hoy'
  if (diasParaRiego === 1) return 'Toca regar mañana'
  return `Toca regar en ${daysLabel(diasParaRiego)}`
}

function detalleAnalisis(analisis: AiAnalysis): string {
  const texto = analisis.problema?.trim() || analisis.accionPrincipal.trim() || 'la IA avisa de algo raro'
  const cabecera = analisis.gravedad === 'grave' ? 'Último análisis (grave)' : 'Último análisis'
  return `${cabecera}: ${texto}`
}

/** La IA solo avisa cuando ve un problema o una gravedad que no sea leve. */
function marcaProblema(analisis: AiAnalysis): boolean {
  return analisis.veredicto === 'problema' || analisis.gravedad === 'moderada' || analisis.gravedad === 'grave'
}

function prioridadVencido(diasParaRiego: number | null): number {
  const retraso = diasParaRiego == null ? 0 : Math.max(0, -diasParaRiego)
  return -retraso
}

function prioridadAnalisis(analisis: AiAnalysis): number {
  return PRIO_ANALISIS + (analisis.gravedad === 'grave' ? 0 : 10)
}

function prioridadProximo(diasParaRiego: number | null): number {
  return PRIO_PROXIMO + Math.max(0, diasParaRiego ?? 0)
}

function comparar(a: AttentionItem, b: AttentionItem): number {
  return (
    a.prioridad - b.prioridad ||
    a.plantNombre.localeCompare(b.plantNombre, 'es') ||
    ORDEN_MOTIVO[a.motivo] - ORDEN_MOTIVO[b.motivo] ||
    a.plantId.localeCompare(b.plantId)
  )
}

export function createReminderService({ plants, events, analyses }: ReminderDeps): ReminderService {
  /**
   * Estado de riego de una planta.
   * Todo se mide en días de calendario con `daysSince`, así que da igual la hora
   * del día: regar a las 23:50 no cambia el estado de mañana.
   */
  async function estado(plantId: string, now: Date = new Date()): Promise<WateringStatus> {
    const plant = await plants.get(plantId)
    const riego = await events.ultimoRiego(plantId)
    const diasDesdeRiego = riego ? daysSince(riego.fecha, now) : null
    const diasDesdePlantado = plant?.fechaPlantado ? daysSince(plant.fechaPlantado, now) : null
    const frecuencia = frecuenciaDe(plant, now)

    if (frecuencia == null) {
      return {
        plantId,
        estado: 'nunca_regada',
        diasDesdeRiego,
        diasParaRiego: null,
        diasDesdePlantado,
        frecuenciaDias: null,
      }
    }

    if (diasDesdeRiego == null) {
      // Sin ningún riego. Mientras no haya pasado la frecuencia desde que la
      // plantaron sigue en arraigo (periodo de adaptación, con el sustrato ya
      // húmedo de la maceta): avisar sería ruido, no información.
      const enArraigo = diasDesdePlantado != null && diasDesdePlantado < frecuencia
      return {
        plantId,
        estado: enArraigo ? 'al_dia' : 'nunca_regada',
        diasDesdeRiego: null,
        diasParaRiego: enArraigo ? frecuencia - diasDesdePlantado : null,
        diasDesdePlantado,
        frecuenciaDias: frecuencia,
      }
    }

    const diasParaRiego = frecuencia - diasDesdeRiego
    const estadoRiego: EstadoRiego =
      diasParaRiego < 0 ? 'vencido' : diasParaRiego <= UMBRAL_PROXIMO ? 'proximo' : 'al_dia'

    return {
      plantId,
      estado: estadoRiego,
      diasDesdeRiego,
      diasParaRiego,
      diasDesdePlantado,
      frecuenciaDias: frecuencia,
    }
  }

  /**
   * Plantas que requieren atención, de más urgente a menos.
   * Una planta puede entrar con dos motivos (por ejemplo riego vencido y un
   * problema detectado por la IA), pero nunca con el mismo motivo dos veces.
   */
  async function attention(opts?: { limite?: number }): Promise<AttentionItem[]> {
    // Un único instante para todas las plantas: si el cálculo cruzase la
    // medianoche, dos plantas de la misma lista no se evaluarían en el mismo día.
    const now = new Date()
    const items: AttentionItem[] = []
    const yaAparentes: Set<string> = new Set()

    const anadir = (item: AttentionItem): void => {
      const clave = `${item.plantId}|${item.motivo}`
      if (yaAparentes.has(clave)) return
      yaAparentes.add(clave)
      items.push(item)
    }

    for (const plant of await plants.list()) {
      const s = await estado(plant.id, now)

      if (s.estado === 'vencido') {
        anadir({
          plantId: plant.id,
          plantNombre: plant.nombre,
          motivo: 'riego_vencido',
          detalle: detalleVencido(s.diasDesdeRiego),
          prioridad: prioridadVencido(s.diasParaRiego),
        })
      } else if (s.estado === 'nunca_regada') {
        anadir({
          plantId: plant.id,
          plantNombre: plant.nombre,
          motivo: 'nunca_regada',
          detalle: detalleNuncaRegada(s.diasDesdePlantado),
          prioridad: PRIO_NUNCA_REGADA,
        })
      } else if (s.estado === 'proximo') {
        anadir({
          plantId: plant.id,
          plantNombre: plant.nombre,
          motivo: 'riego_proximo',
          detalle: detalleProximo(s.diasParaRiego),
          prioridad: prioridadProximo(s.diasParaRiego),
        })
      }

      const analisis = await analyses.ultimo(plant.id)
      if (analisis && marcaProblema(analisis)) {
        anadir({
          plantId: plant.id,
          plantNombre: plant.nombre,
          motivo: 'analisis_problema',
          detalle: detalleAnalisis(analisis),
          prioridad: prioridadAnalisis(analisis),
        })
      }
    }

    items.sort(comparar)
    const limite = opts?.limite
    return limite == null ? items : items.slice(0, Math.max(0, Math.trunc(limite)))
  }

  return { estado, attention }
}