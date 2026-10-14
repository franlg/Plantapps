import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface DateInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> {
  /** Valor en formato `YYYY-MM-DD` (ver `todayIso()` y `toIsoDate()` de `@/lib/dates`). */
  value?: string
  className?: string
}

/**
 * Selector de fecha. Usa el calendario nativo del móvil, que es el que mejor
 * funciona con una sola mano. El valor siempre viaja como texto `YYYY-MM-DD`.
 */
export function DateInput({ className, ...props }: DateInputProps) {
  return <input type="date" className={cn('campo', className)} {...props} />
}
