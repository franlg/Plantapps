import { Button } from '@/ui/components/Button'
import { Sheet } from '@/ui/components/Sheet'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** Explica qué se va a perder. Que sea concreto, no "Se va a borrar". */
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** Pinta el botón de confirmar en rojo. Úsalo al borrar o archivar. */
  destructive?: boolean
}

/**
 * Confirmación antes de una acción que no se puede deshacer (borrar una planta).
 * Se cierra con Escape, con la ✕ o tocando fuera, y eso cuenta como cancelar.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row-reverse">
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            className="w-full sm:w-auto"
          >
            {confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onCancel} className="w-full sm:w-auto">
            {cancelLabel}
          </Button>
        </div>
      }
    >
      <p className="text-[var(--text-muted)] leading-relaxed">{message}</p>
    </Sheet>
  )
}
