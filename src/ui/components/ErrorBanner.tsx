import { Button } from '@/ui/components/Button'

export interface ErrorBannerProps {
  /** Qué ha fallado, en una frase: "No se ha podido guardar la planta". */
  title: string
  /** Detalle opcional: el mensaje técnico o una pista de qué hacer. */
  message?: string
  onRetry?: () => void
  onDismiss?: () => void
}

/**
 * Aviso de error accesible (role="alert": se lee nada más aparecer).
 * No tapa la pantalla ni interrumpe: la app sigue funcionando sin esa acción.
 */
export function ErrorBanner({ title, message, onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-peligro-200 bg-peligro-100 p-3 dark:border-peligro-800 dark:bg-peligro-900"
    >
      <span aria-hidden="true" className="text-xl leading-6">
        ⚠️
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-peligro-800 dark:text-peligro-100">{title}</p>
        {message ? (
          <p className="mt-0.5 text-xs leading-relaxed break-words text-peligro-700 dark:text-peligro-200">
            {message}
          </p>
        ) : null}

        {onRetry || onDismiss ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {onRetry ? (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Reintentar
              </Button>
            ) : null}
            {onDismiss ? (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Cerrar
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
