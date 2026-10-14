import type { MouseEventHandler, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
  children: ReactNode
  /** `primary` para la acción principal de la pantalla; `danger` solo para borrar. */
  variant?: ButtonVariant
  /** Las tres alturas respetan el mínimo de 44 px para el dedo. */
  size?: ButtonSize
  type?: 'button' | 'submit'
  onClick?: MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  /** Muestra un spinner y bloquea el botón mientras dura la acción. */
  loading?: boolean
  fullWidth?: boolean
  className?: string
}

const VARIANTES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 ' +
    'dark:bg-brand-300 dark:text-brand-900 dark:hover:bg-brand-200 dark:active:bg-brand-100',
  secondary:
    'superficie text-[var(--text)] hover:border-brand-300 hover:bg-brand-50 ' +
    'dark:hover:border-brand-700 dark:hover:bg-brand-900/40',
  ghost:
    'bg-transparent text-brand-700 hover:bg-brand-50 active:bg-brand-100 ' +
    'dark:text-brand-200 dark:hover:bg-brand-900/50 dark:active:bg-brand-900',
  danger:
    'bg-peligro-600 text-white shadow-sm hover:bg-peligro-700 active:bg-peligro-800 ' +
    'dark:bg-peligro-300 dark:text-peligro-900 dark:hover:bg-peligro-200 dark:active:bg-peligro-100',
}

const TAMANOS: Record<ButtonSize, string> = {
  // 44 / 48 / 56 px: ni el más pequeño baja del mínimo táctil.
  sm: 'min-h-11 px-3 text-sm gap-1.5',
  md: 'min-h-12 px-4 text-base gap-2',
  lg: 'min-h-14 px-5 text-lg gap-2.5',
}

/**
 * Botón grande y legible. Nunca baja de 44 px de alto: se usa con el pulgar
 * y a una sola mano, con frecuencia y sin mirar del todo.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  onClick,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
}: ButtonProps) {
  const inactivo = disabled || loading

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={inactivo}
      aria-busy={loading || undefined}
      className={cn(
        'tap-target rounded-2xl font-semibold select-none',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTES[variant],
        TAMANOS[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? <SpinnerInterno /> : null}
      <span className={cn('inline-flex items-center', loading && 'opacity-90')}>{children}</span>
    </button>
  )
}

/** Spinner del propio botón: hereda el color del texto para no duplicar colores. */
function SpinnerInterno() {
  return (
    <svg
      className="size-5 shrink-0 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
