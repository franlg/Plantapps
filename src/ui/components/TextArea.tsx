import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  className?: string
}

/** Campo de texto largo, para notas y comentarios. Redimensionable en vertical. */
export function TextArea({ className, rows = 3, ...props }: TextAreaProps) {
  return <textarea rows={rows} className={cn('campo campo-textarea', className)} {...props} />
}
