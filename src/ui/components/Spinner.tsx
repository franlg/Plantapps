export type SpinnerSize = 'sm' | 'md' | 'lg'

export interface SpinnerProps {
  size?: SpinnerSize
  /** Texto para lectores de pantalla. Por defecto "Cargando". */
  label?: string
  className?: string
}

const TAMANOS: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-10',
}

/** Indicador de carga. El texto oculto acompaña siempre al dibujo girando. */
export function Spinner({ size = 'md', label = 'Cargando', className }: SpinnerProps) {
  return (
    <span role="status" className={className}>
      <svg
        className={`${TAMANOS[size]} animate-spin text-current`}
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
      <span className="sr-only">{label}</span>
    </span>
  )
}
