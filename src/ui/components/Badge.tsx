import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'ok' | 'alerta' | 'peligro' | 'neutro' | 'marca'

export interface BadgeProps {
  children: ReactNode
  /** `ok` verde, `alerta` ámbar, `peligro` rojo, `marca` verde planta, `neutro` gris. */
  tone?: BadgeTone
  className?: string
}

const TONOS: Record<BadgeTone, string> = {
  ok: 'bg-ok-100 text-ok-800 dark:bg-ok-900 dark:text-ok-200',
  alerta: 'bg-alerta-100 text-alerta-800 dark:bg-alerta-900 dark:text-alerta-200',
  peligro: 'bg-peligro-100 text-peligro-800 dark:bg-peligro-900 dark:text-peligro-200',
  marca: 'bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100',
  neutro: 'bg-[var(--border-soft)] text-[var(--text-muted)]',
}

/** Pastilla de color con texto: el semáforo de la app en una línea. */
export function Badge({ children, tone = 'neutro', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1',
        'text-xs leading-5 font-semibold whitespace-nowrap',
        TONOS[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
