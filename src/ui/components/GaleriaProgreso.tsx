import { useState } from 'react'
import { PhotoThumb } from './PhotoThumb'
import { cn } from '@/lib/cn'
import { formatDateEs } from '@/lib/dates'
import { VEREDICTO_EMOJI, VEREDICTO_LABELS } from '@/types'
import type { FotoProgreso, ID } from '@/types'

export interface GaleriaProgresoProps {
  /** Fotos ordenadas de más reciente a más antigua. El hook se las da ya listas. */
  fotos: FotoProgreso[]
  /** Se llama al tocar una foto, con su id. */
  onAbrir?: (photoId: ID) => void
  /** Título de la sección. Por defecto "Progreso". */
  titulo?: string
  /** Texto cuando no hay ninguna foto. */
  vacio?: string
  /** Cuántas fotos se ven antes de pulsar "ver todas". Por defecto 4. */
  visibles?: number
  className?: string
}

/** La foto mide 96×96, igual que `PhotoThumb` en `lg`. */
const LADO = 'size-24'

/**
 * Galería del progreso visual de una planta: una tira horizontal de fotos con su
 * fecha debajo, pensada para hojearla con el pulgar.
 *
 * La galería no pide nada a la base de datos: recibe las fotos ya ordenadas y
 * delega la miniatura en `PhotoThumb`, que ya sabe poner un placeholder si la
 * foto no se puede decodificar (así un fallo nunca deja la tira a medias).
 *
 * Si hay más fotos que `visibles`, se enseñan las primeras y un botón
 * "Ver todas (N)" que despliega el resto en el sitio, sin diálogo que tape la
 * pantalla.
 */
export function GaleriaProgreso({
  fotos,
  onAbrir,
  titulo = 'Progreso',
  vacio = 'Todavía no hay fotos.',
  visibles = 4,
  className,
}: GaleriaProgresoProps) {
  const [desplegada, setDesplegada] = useState(false)
  const cuantas = Math.max(0, Math.floor(visibles))
  const mostradas = desplegada ? fotos : fotos.slice(0, cuantas)
  const hayMas = fotos.length > cuantas

  return (
    <section className={cn('w-full min-w-0', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--text)]">{titulo}</h2>
        {hayMas ? (
          <button
            type="button"
            onClick={() => setDesplegada((v) => !v)}
            aria-expanded={desplegada}
            className={cn(
              'tap-target shrink-0 rounded-full px-3 text-sm font-semibold',
              'text-brand-700 hover:bg-brand-50 active:bg-brand-100',
              'dark:text-brand-200 dark:hover:bg-brand-900/50 dark:active:bg-brand-900',
            )}
          >
            {desplegada ? 'Ver menos' : `Ver todas (${fotos.length})`}
          </button>
        ) : null}
      </div>

      {fotos.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <span aria-hidden="true">📷</span>
          {vacio}
        </p>
      ) : (
        <ul
          className={cn(
            '-mx-1 flex list-none gap-3 overscroll-x-contain px-1 pb-1',
            'snap-x snap-mandatory overflow-x-auto',
          )}
        >
          {mostradas.map((foto) => (
            <li key={foto.id} className="w-24 shrink-0 snap-start">
              <Celda foto={foto} onAbrir={onAbrir} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Una foto con su fecha debajo: entera si se puede abrir, decorativa si no. */
function Celda({ foto, onAbrir }: { foto: FotoProgreso; onAbrir?: (photoId: ID) => void }) {
  const fecha = formatDateEs(foto.fecha)
  const texto = `${fecha}${foto.veredicto ? `, ${VEREDICTO_LABELS[foto.veredicto]}` : ''}`

  const contenido = (
    <>
      <span className="relative block">
        <PhotoThumb photoId={foto.id} alt={`Foto de la planta del ${fecha}`} size="lg" className={LADO} />
        {foto.veredicto ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -bottom-1 rounded-full bg-[var(--surface-raised)] px-0.5 text-xs leading-none shadow"
          >
            {VEREDICTO_EMOJI[foto.veredicto]}
          </span>
        ) : null}
      </span>
      {/* La fecha va dentro del objetivo táctil, para que toda la foto sea pulsable. */}
      <span className="mt-1 block text-xs leading-tight text-[var(--text-muted)]">{fecha}</span>
    </>
  )

  if (!onAbrir) {
    return <div className="min-h-11 text-left">{contenido}</div>
  }

  return (
    <button
      type="button"
      onClick={() => onAbrir(foto.id)}
      aria-label={`Abrir foto del ${texto}`}
      className="block min-h-11 w-full rounded-2xl text-left"
    >
      {contenido}
    </button>
  )
}
