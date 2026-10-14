import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface EmptyStateProps {
  /** Emoji o SVG grande (48-64 px) que explica de qué va el estado vacío. */
  icono: ReactNode
  title: string
  description?: string
  /** Botón principal, por ejemplo "Añadir planta". */
  action?: ReactNode
  className?: string
}

/**
 * Lo que se ve cuando aún no hay nada que mostrar.
 * Explica qué pasar y ofrece el siguiente paso, para no dejar al usuario parado.
 */
export function EmptyState({ icono, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl px-6 py-10 text-center',
        className,
      )}
    >
      <div aria-hidden="true" className="text-5xl leading-none">
        {icono}
      </div>
      <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
      {description ? (
        <p className="max-w-xs text-sm leading-relaxed text-balance text-[var(--text-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
