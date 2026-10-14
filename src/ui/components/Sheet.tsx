import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Barra fija abajo con las acciones principales (guardar, cancelar...). */
  footer?: ReactNode
}

/** Selector de todo lo que se puede tabular dentro de la hoja. */
const FOCALIZABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Hoja inferior tipo modal: el patrón que ya conoce cualquiera que use una app
 * en el móvil. Sube desde abajo, ocupa casi toda la pantalla y deja el fondo a la
 * vista para no perder el contexto.
 *
 * Se cierra con la ✕, con Escape o tocando fuera; bloquea el scroll del fondo
 * y devuelve el foco al elemento que la abrió.
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const focoPrevioRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  // Al abrir, el foco entra en la hoja y guardamos de dónde venía.
  useEffect(() => {
    if (!open) return
    focoPrevioRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
  }, [open])

  // Bloquea el scroll del fondo mientras la hoja está abierta.
  useEffect(() => {
    if (!open) return
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previo
    }
  }, [open])

  // Escape cierra la hoja y Tab nunca se sale de ella.
  useEffect(() => {
    if (!open) return

    const alPulsarTecla = (evento: globalThis.KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        onClose()
        return
      }
      if (evento.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const candidatos = Array.from(panel.querySelectorAll<HTMLElement>(FOCALIZABLES)).filter(
        (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
      )
      if (candidatos.length === 0) {
        evento.preventDefault()
        panel.focus()
        return
      }
      const primero = candidatos[0]
      const ultimo = candidatos[candidatos.length - 1]
      const activo = document.activeElement
      if (evento.shiftKey && (activo === primero || activo === panel)) {
        evento.preventDefault()
        ultimo?.focus()
      } else if (!evento.shiftKey && activo === ultimo) {
        evento.preventDefault()
        primero?.focus()
      }
    }

    document.addEventListener('keydown', alPulsarTecla)
    return () => document.removeEventListener('keydown', alPulsarTecla)
  }, [open, onClose])

  // Al cerrar, el foco vuelve al botón que la abrió.
  useEffect(() => {
    if (open) return
    const foco = focoPrevioRef.current
    focoPrevioRef.current = null
    if (foco && document.contains(foco)) foco.focus()
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      {/* Fondo pulsable para cerrar. No contiene información, por eso aria-hidden. */}
      <div className="hoja-fondo absolute inset-0 bg-black/55" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'hoja-panel relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col',
          'rounded-3xl border border-[var(--border-soft)] bg-[var(--surface-raised)] shadow-2xl',
        )}
      >
        <span className="hoja-asa mx-auto mt-2 shrink-0 sm:hidden" aria-hidden="true" />

        <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
          <h2 id={titleId} className="flex-1 text-lg font-semibold text-[var(--text)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="tap-icono shrink-0 text-[var(--text-muted)] hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-900/50 dark:hover:text-brand-200"
          >
            <svg
              viewBox="0 0 20 20"
              className="size-5"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">{children}</div>

        {footer ? (
          <footer className="area-segura-abajo shrink-0 border-t border-[var(--border-soft)] px-4 pt-3">
            {footer}
          </footer>
        ) : (
          <div className="area-segura-abajo shrink-0" />
        )}
      </div>
    </div>,
    document.body,
  )
}
