import { Badge, type BadgeTone } from '@/ui/components/Badge'
import { VEREDICTO_EMOJI, VEREDICTO_LABELS, type Veredicto } from '@/types'

export interface VeredictoChipProps {
  veredicto: Veredicto
  className?: string
}

const TONO: Record<Veredicto, BadgeTone> = {
  todo_ok: 'ok',
  no_regar: 'ok',
  regar: 'marca',
  trasplantar: 'alerta',
  problema: 'peligro',
}

/** Qué dice la IA que hay que hacer con la planta, en una pastilla. */
export function VeredictoChip({ veredicto, className }: VeredictoChipProps) {
  return (
    <Badge tone={TONO[veredicto]} className={className}>
      <span aria-hidden="true">{VEREDICTO_EMOJI[veredicto]}</span>
      <span>{VEREDICTO_LABELS[veredicto]}</span>
    </Badge>
  )
}
