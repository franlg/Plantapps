import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Props que <Field> inyecta en el control que envuelve (TextInput, Select...). */
export interface FieldControlProps {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
}

export interface FieldProps {
  label: string
  /** Ayuda o ejemplo, siempre visible debajo del campo. */
  hint?: string
  /** Texto del error. Si viene, se marca el campo como inválido y se anuncia. */
  error?: string
  required?: boolean
  /** El control: <TextInput>, <TextArea>, <Select>, <DateInput>... */
  children: ReactNode
  /** `htmlFor` del control. Si no se pasa, <Field> inventa uno y lo conecta. */
  htmlFor?: string
  className?: string
}

/**
 * Envoltorio de campo: etiqueta, ayuda y error.
 * Conecta solo la etiqueta, la ayuda y el error con el control que lleva dentro
 * (no hay que repetir ids ni aria-describedby en cada pantalla).
 */
export function Field({ label, hint, error, required, children, htmlFor, className }: FieldProps) {
  const idGenerado = useId()
  const esControl = isValidElement<FieldControlProps>(children)
  const idPropio = esControl ? children.props.id : undefined

  const controlId = htmlFor ?? idPropio ?? idGenerado
  const hintId = `${controlId}-hint`
  const errorId = `${controlId}-error`

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  const control = esControl
    ? cloneElement(children as ReactElement<FieldControlProps>, {
        id: htmlFor ?? idPropio ?? idGenerado,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })
    : children

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className="text-sm font-semibold text-[var(--text)]">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-peligro-600 dark:text-peligro-300">
              *
            </span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        ) : null}
      </label>

      {control}

      {hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-[var(--text-muted)]">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1 text-xs font-medium text-peligro-700 dark:text-peligro-300"
        >
          <span aria-hidden="true">⚠️</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}
