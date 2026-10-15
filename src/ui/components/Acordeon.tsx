import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface AcordeonProps {
  /** Título de la sección. Puede llevar el contador dentro, si quieres. */
  titulo: ReactNode
  /** Badge o contador opcional a la derecha del título. */
  contador?: ReactNode
  /** Contenido plegable. */
  children: ReactNode
  /** `true` = desplegado. Controlado por el padre si se pasa `abierto`. */
  abierto?: boolean
  /** Cambia al plegar/desplegar. Si no se pasa, el componente se controla solo. */
  onToggle?: (abierto: boolean) => void
  /** Tono del borde/cabecera según urgencia: neutro | ok | alerta | peligro. */
  tono?: 'neutro' | 'ok' | 'alerta' | 'peligro'
  /** Texto para lectores de pantalla del botón de plegar. */
  etiqueta?: string
  className?: string
}

type Tono = NonNullable<AcordeonProps['tono']>

/** Franja de color a la izquierda, como `.superficie-faja`, para ordenar por urgencia. */
const TONOS: Record<Tono, string> = {
  neutro: '',
  ok: 'border-l-4 border-l-ok-500 dark:border-l-ok-300',
  alerta: 'border-l-4 border-l-alerta-500 dark:border-l-alerta-300',
  peligro: 'border-l-4 border-l-peligro-500 dark:border-l-peligro-300',
}

/** Velo suave del mismo color: el tono se lee de un vistazo sin gritar. */
const TONOS_CABECERA: Record<Tono, string> = {
  neutro: '',
  ok: 'bg-ok-100/70 dark:bg-ok-900/50',
  alerta: 'bg-alerta-100/70 dark:bg-alerta-900/50',
  peligro: 'bg-peligro-100/70 dark:bg-peligro-900/50',
}

/**
 * Sección plegable: toda la cabecera es un botón de 44 px, así que se abre con
 * el pulgar sin tener que acertar una flecha pequeña.
 *
 * Funciona solo (sin `abierto`) o controlado por el padre (con `abierto` y
 * `onToggle`). El contenido no tiene scroll propio: al desplegarse empuja el
 * resto de la pantalla.
 */
export function Acordeon({
  titulo,
  contador,
  children,
  abierto,
  onToggle,
  tono = 'neutro',
  etiqueta,
  className,
}: AcordeonProps) {
  const uid = useId()
  const cabeceraId = `acordeon-cabecera-${uid}`
  const panelId = `acordeon-panel-${uid}`

  // Con `abierto` manda el padre; sin él, el acordeón se despliega solo.
  const controlado = abierto !== undefined
  const [interno, setInterno] = useState(false)
  const estaAbierto = controlado ? abierto : interno

  const alternar = () => {
    const siguiente = !estaAbierto
    if (!controlado) setInterno(siguiente)
    onToggle?.(siguiente)
  }

  return (
    <section
      className={cn(
        'superficie overflow-hidden',
        TONOS[tono],
        className,
      )}
    >
      <button
        id={cabeceraId}
        type="button"
        aria-expanded={estaAbierto}
        aria-controls={panelId}
        onClick={alternar}
        className={cn(
          'tap-target w-full min-w-0 justify-start gap-3 px-4 py-3 text-left select-none',
          'text-[var(--text)] transition-[filter,border-color,background-color] duration-150',
          'hover:brightness-95 dark:hover:brightness-110',
          estaAbierto && 'border-b border-[var(--border-soft)]',
          TONOS_CABECERA[tono],
        )}
      >
        <span className="min-w-0 flex-1 text-base font-semibold">{titulo}</span>
        {/* `contador` puede ser 0, así que se mira que exista y no que sea "verdady". */}
        {contador !== undefined && contador !== null ? (
          <span className="shrink-0">{contador}</span>
        ) : null}
        <Chevron abierto={estaAbierto} />
        {/* La acción también se anuncia: el título solo no dice qué hace el botón. */}
        <span className="sr-only">{etiqueta ?? (estaAbierto ? 'Plegar sección' : 'Desplegar sección')}</span>
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={cabeceraId}
        hidden={!estaAbierto}
        className="px-4 pt-3 pb-4 text-[var(--text-muted)]"
      >
        {children}
      </div>
    </section>
  )
}

/** Chevron propio: hereda el color del texto y gira al desplegarse. */
function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn(
        'size-5 shrink-0 text-[var(--text-muted)]',
        'transition-transform duration-200 motion-reduce:transition-none',
        abierto && 'rotate-180',
      )}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}