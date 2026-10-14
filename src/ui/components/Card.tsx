import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Etiqueta HTML admitida, para poder usar el Card como <li> dentro de una lista. */
export type CardAs = 'div' | 'section' | 'li'

export interface CardProps {
  children: ReactNode
  className?: string
  /** Por defecto `div`. Usa `section` para bloques con título y `li` en listas. */
  as?: CardAs
}

/**
 * Contenedor con superficie elevada: fondo claro, borde suave y esquinas grandes.
 * Es la caja base de las tarjetas de planta, historial, ajustes, etc.
 */
export function Card({ children, className, as = 'div' }: CardProps) {
  const Tag = as
  return (
    <Tag
      className={cn(
        'superficie p-4 shadow-sm',
        // `as="section"` y `as="li"` necesitan volver a ser bloques con flujo normal.
        as === 'li' && 'list-none',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
