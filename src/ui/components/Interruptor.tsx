import { cn } from '@/lib/cn'

export interface InterruptorProps {
  /** Si está encendido. */
  activo: boolean
  /** Texto accesible: qué controla este interruptor. */
  etiqueta: string
  /** Apagado y no pulsable (por ejemplo, sin permiso de notificaciones). */
  deshabilitado?: boolean
  onChange: (siguiente: boolean) => void
  className?: string
}

/**
 * Interruptor de encendido y apagado.
 *
 * Es un `<button role="switch">` con `aria-checked`: los lectores de pantalla
 * anuncian "activado" o "desactivado" en vez de "pulsado". El botón ocupa 44 px
 * de alto aunque el carril se vea más fino, que es lo que pide el dedo.
 */
export function Interruptor({
  activo,
  etiqueta,
  deshabilitado = false,
  onChange,
  className,
}: InterruptorProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onChange(!activo)}
      className={cn(
        'tap-target w-16 shrink-0',
        deshabilitado && 'cursor-not-allowed opacity-55',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative block h-8 w-14 rounded-full border transition-colors',
          activo
            ? 'border-brand-600 bg-brand-600'
            : 'border-[var(--border-soft)] bg-[var(--border-soft)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-7 rounded-full bg-white shadow-sm transition-transform',
            activo && 'translate-x-6',
          )}
        />
      </span>
    </button>
  )
}