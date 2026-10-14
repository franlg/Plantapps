import type { AnalysisRepo, EventRepo, PlantRepo } from '@/services/contracts'
import type { ReminderService } from '@/services/contracts'
import type { AttentionItem, WateringStatus } from '@/types'
import { daysSince } from '@/lib/dates'

/** Frecuencia de riego por defecto si la planta no tiene ninguna configurada. */
export const FRECUENCIA_POR_DEFECTO = 7

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

export function createReminderService({ plants, events, analyses }: ReminderDeps): ReminderService {
  async function estado(plantId: string, now: Date = new Date()): Promise<WateringStatus> {
    const plant = await plants.get(plantId)
    const riego = await events.ultimoRiego(plantId)
    const diasDesdeRiego = riego ? daysSince(riego.fecha, now) : null
    const frecuencia = plant?.frecuenciaRiegoDias ?? null
    const diasDesdePlantado = plant?.fechaPlantado ? daysSince(plant.fechaPlantado, now) : null

    if (diasDesdeRiego == null) {
      return {
        plantId,
        estado: 'nunca_regada',
        diasDesdeRiego,
        diasParaRiego: null,
        diasDesdePlantado,
        frecuenciaDias: frecuencia,
      }
    }

    const base = frecuencia ?? FRECUENCIA_POR_DEFECTO
    const diasParaRiego = base - diasDesdeRiego

    return {
      plantId,
      estado: diasParaRiego > 1 ? 'al_dia' : diasParaRiego >= 0 ? 'proximo' : 'vencido',
      diasDesdeRiego,
      diasParaRiego,
      diasDesdePlantado,
      frecuenciaDias: base,
    }
  }

  async function attention(opts?: { limite?: number }): Promise<AttentionItem[]> {
    const items: AttentionItem[] = []
    const todas = await plants.list()

    for (const plant of todas) {
      const s = await estado(plant.id)

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

      const ultimoAnalisis = await analyses.ultimo(plant.id)
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
  }

  return { estado, attention }
}