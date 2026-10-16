import { cn } from '@/lib/cn'
import { TENDENCIA_LABELS } from '@/types'
import type { Tendencia } from '@/types'

export interface TarjetaComparacionProps {
  /** Tendencia que ha devuelto el modelo. */
  tendencia: Tendencia
  /** Qué ha cambiado, en lenguaje sencillo. */
  detalle: string
  /** `false` si el modelo no pudo comparar (otro ángulo, otra luz...). */
  comparable: boolean
  className?: string
}

type Tono = 'ok' | 'alerta' | 'neutro'

/** Icono de cada tendencia: se lee de un vistazo sin necesidad de leer el texto. */
const ICONOS: Record<Tendencia, string> = {
  mejor: '📈',
  igual: '➖',
  peor: '📉',
}

/**
 * Color de cada tendencia, con su versión oscura: mejorar es bueno (verde),
 * seguir igual no es ninguna noticia (gris) y empeorar pide atención (ámbar).
 */
const TONOS: Record<Tono, string> = {
  ok: 'border-l-ok-500 bg-ok-100/70 dark:border-l-ok-300 dark:bg-ok-900/50',
  alerta: 'border-l-alerta-500 bg-alerta-100/70 dark:border-l-alerta-300 dark:bg-alerta-900/50',
  neutro: 'border-l-[var(--border-soft)] bg-[var(--border-soft)]',
}

/** Tono de la tendencia tal y como la manda el modelo. */
const TONO_POR_TENDENCIA: Record<Tendencia, Tono> = {
  mejor: 'ok',
  igual: 'neutro',
  peor: 'alerta',
}

/** Título cuando no hay con qué comparar: no se inventa una tendencia. */
const TITULO_SIN_COMPARAR = 'Sin comparación'

/**
 * Cómo ha evolucionado la planta respecto a la foto anterior.
 *
 * Si el modelo no ha podido comparar (otro ángulo, otra luz, otra hora), la
 * tarjeta se vuelve neutra y lo dice: jamás da a entender que la planta "sigue
 * igual" cuando en realidad no se sabe.
 */
export function TarjetaComparacion({
  tendencia,
  detalle,
  comparable,
  className,
}: TarjetaComparacionProps) {
  const tono = comparable ? TONOS[TONO_POR_TENDENCIA[tendencia]] : TONOS.neutro

  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--border-soft)] border-l-4 p-3',
        tono,
        className,
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <span aria-hidden="true">{comparable ? ICONOS[tendencia] : '🤔'}</span>
        {comparable ? TENDENCIA_LABELS[tendencia] : TITULO_SIN_COMPARAR}
      </p>

      {!comparable ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
          No he podido comparar con la foto anterior: el ángulo, la luz o la hora eran distintos.
        </p>
      ) : null}

      {/* El detalle va entero: es la explicación, y recortarla la dejaría coja. */}
      <p className="mt-1 text-sm leading-relaxed text-[var(--text)]">{detalle}</p>
    </div>
  )
}
