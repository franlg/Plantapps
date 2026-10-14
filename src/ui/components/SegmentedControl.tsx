import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  value: T
  options: SegmentedControlOption<T>[]
  onChange: (value: T) => void
  /** Nombre del grupo, obligatorio: "Vista lista" / "Filtro por estado". */
  ariaLabel: string
  className?: string
}

/**
 * Control segmentado: 2-4 opciones excluyentes en la misma fila.
 * Pensado para cambiar de vista o de filtro sin salir de la pantalla.
 * Con teclado se mueve con las flechas izquierda/derecha y con Inicio/Fin.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const mover = (indice: number) => {
    const total = options.length
    if (total === 0) return
    const siguiente = ((indice % total) + total) % total
    const opcion = options[siguiente]
    if (!opcion) return
    onChange(opcion.value)
    refs.current[siguiente]?.focus()
  }

  const onKeyDown = (evento: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    switch (evento.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        evento.preventDefault()
        mover(indice + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        evento.preventDefault()
        mover(indice - 1)
        break
      case 'Home':
        evento.preventDefault()
        mover(0)
        break
      case 'End':
        evento.preventDefault()
        mover(options.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'flex gap-1 rounded-2xl border border-[var(--border-soft)] bg-[var(--border-soft)] p-1',
        className,
      )}
    >
      {options.map((opcion, indice) => {
        const activo = opcion.value === value
        return (
          <button
            key={opcion.value}
            ref={(nodo) => {
              refs.current[indice] = nodo
            }}
            type="button"
            role="radio"
            aria-checked={activo}
            // Solo la opción activa entra en el recorrido del tabulador;
            // las flechas se encargan del resto.
            tabIndex={activo ? 0 : -1}
            onClick={() => onChange(opcion.value)}
            onKeyDown={(evento) => onKeyDown(evento, indice)}
            className={cn(
              'tap-target min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold transition-colors',
              activo
                ? 'bg-[var(--surface-raised)] text-[var(--text)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            {opcion.label}
          </button>
        )
      })}
    </div>
  )
}
