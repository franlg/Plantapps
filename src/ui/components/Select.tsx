import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'children'> {
  /** Opciones del desplegable. Añade `{ value: '', label: 'Sin especificar' }` si es opcional. */
  options: SelectOption[]
  className?: string
}

/** Lista desplegable con la flecha dibujada por nosotros (se ve igual en claro y oscuro). */
export function Select({ options, className, ...props }: SelectProps) {
  return (
    <select className={cn('campo campo-select', className)} {...props}>
      {options.map((opcion) => (
        <option key={opcion.value} value={opcion.value}>
          {opcion.label}
        </option>
      ))}
    </select>
  )
}
