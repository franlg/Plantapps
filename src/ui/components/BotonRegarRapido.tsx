import { Spinner } from './Spinner'
import { cn } from '@/lib/cn'

export interface BotonRegarRapidoProps {
  onClick: () => void
  /** `true` mientras se está registrando: deshabilita y muestra el spinner. */
  cargando?: boolean
  /** Nombre de la planta, para el texto accesible. */
  nombrePlanta: string
  /** Tamaño: 'sm' para dentro de una tarjeta, 'md' para destacar. */
  size?: 'sm' | 'md'
  className?: string
}

type Tamano = NonNullable<BotonRegarRapidoProps['size']>

/** Ninguno baja de 44 px: el botón se usa con el pulgar y sin mirar. */
const TAMANOS: Record<Tamano, string> = {
  sm: 'min-h-11 px-3 text-sm gap-1.5',
  md: 'min-h-12 px-4 text-base gap-2',
}

const TAMANO_SPINNER = { sm: 'sm', md: 'md' } as const satisfies Record<Tamano, 'sm' | 'md'>

/**
 * Regar sin abrir la ficha de la planta.
 *
 * El texto que se ve es "💧 Regar", pero el nombre accesible cuenta toda la
 * verdad (`"Registrar que has regado la Monstera"`): quien use lector de
 * pantalla no se encuentra con tres botones idénticos llamados "Regar".
 *
 * Va en color de marca, no de peligro: regar es la acción positiva de la app.
 */
export function BotonRegarRapido({
  onClick,
  cargando = false,
  nombrePlanta,
  size = 'md',
  className,
}: BotonRegarRapidoProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cargando}
      aria-busy={cargando || undefined}
      aria-label={`Registrar que has regado ${nombrePlanta}`}
      className={cn(
        'tap-target rounded-2xl font-semibold select-none',
        'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
        'dark:bg-brand-300 dark:text-brand-900 dark:hover:bg-brand-200 dark:active:bg-brand-100',
        'disabled:cursor-not-allowed disabled:opacity-55',
        TAMANOS[size],
        className,
      )}
    >
      {cargando ? (
        <Spinner size={TAMANO_SPINNER[size]} label="Registrando el riego" />
      ) : (
        <span aria-hidden="true">💧</span>
      )}
      <span>Regar</span>
    </button>
  )
}
