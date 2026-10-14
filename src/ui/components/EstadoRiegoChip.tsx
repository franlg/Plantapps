import { Badge } from '@/ui/components/Badge'
import { daysLabel } from '@/lib/dates'
import { ESTADO_REGIO_LABELS, type EstadoRiego } from '@/types'

export interface EstadoRiegoChipProps {
  estado: EstadoRiego
  /** Negativo = días de retraso. Ver `WateringStatus.diasParaRiego`. */
  diasParaRiego?: number | null
}

const TONO: Record<EstadoRiego, 'ok' | 'alerta' | 'peligro' | 'neutro'> = {
  al_dia: 'ok',
  proximo: 'alerta',
  vencido: 'peligro',
  nunca_regada: 'neutro',
}

const EMOJI: Record<EstadoRiego, string> = {
  al_dia: '✅',
  proximo: '💧',
  vencido: '⚠️',
  nunca_regada: '❔',
}

/** Texto corto con los días, solo cuando aportan información. */
function detalle(estado: EstadoRiego, dias: number | null | undefined): string | null {
  if (dias == null || !Number.isFinite(dias)) return null
  if (estado === 'vencido') return daysLabel(dias)
  if (estado === 'proximo' || estado === 'al_dia') {
    if (dias <= 0) return 'Hoy'
    if (dias === 1) return 'Mañana'
    return `En ${dias} días`
  }
  return null
}

/**
 * Estado de riego de una planta en una sola pastilla.
 * Verde si está al día, ámbar si toca pronto, rojo si se le pasó.
 */
export function EstadoRiegoChip({ estado, diasParaRiego }: EstadoRiegoChipProps) {
  const extra = detalle(estado, diasParaRiego)

  return (
    <Badge tone={TONO[estado]}>
      <span aria-hidden="true">{EMOJI[estado]}</span>
      <span>{ESTADO_REGIO_LABELS[estado]}</span>
      {extra ? <span className="font-normal opacity-80">· {extra}</span> : null}
    </Badge>
  )
}
