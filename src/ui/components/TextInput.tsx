import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  className?: string
}

/**
 * Campo de texto de una línea. Mínimo 44 px de alto y 16 px de letra: el dedo
 * entra y el teclado del móvil no se cierra con un zoom inesperado.
 */
export function TextInput({ className, type = 'text', ...props }: TextInputProps) {
  return <input type={type} className={cn('campo', className)} {...props} />
}
