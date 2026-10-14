import { useState } from 'react'
import { usePhotoUrl } from '@/db/context'
import { cn } from '@/lib/cn'
import type { ID } from '@/types'

export type PhotoThumbSize = 'sm' | 'md' | 'lg'

export interface PhotoThumbProps {
  /** `undefined` si la planta todavía no tiene foto. */
  photoId: ID | undefined
  /** Texto alternativo OBLIGATORIO: describe la foto para quien usa lector de pantalla. */
  alt: string
  className?: string
  size?: PhotoThumbSize
}

const TAMANOS: Record<PhotoThumbSize, string> = {
  sm: 'size-12',
  md: 'size-16',
  lg: 'size-24',
}

/**
 * Miniatura de una foto guardada en el dispositivo.
 * Muestra un degradado verde mientras carga y también si la foto no existe
 * o si el navegador no la puede decodificar, para no dejar un hueco vacío.
 */
export function PhotoThumb({ photoId, alt, className, size = 'md' }: PhotoThumbProps) {
  const url = usePhotoUrl(photoId)
  const [cargada, setCargada] = useState(false)
  const [fallo, setFallo] = useState(false)

  // Si cambia de foto, hay que volver a esperar a que cargue.
  const clave = `${photoId ?? ''}`
  const [claveVista, setClaveVista] = useState(clave)
  if (clave !== claveVista) {
    setClaveVista(clave)
    setCargada(false)
    setFallo(false)
  }

  const mostrarImagen = url !== undefined && !fallo

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br',
        'from-brand-100 to-brand-300 dark:from-brand-900 dark:to-brand-700',
        TAMANOS[size],
        className,
      )}
    >
      {mostrarImagen ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setCargada(true)}
          onError={() => setFallo(true)}
          className={cn(
            'size-full object-cover transition-opacity duration-200',
            cargada ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}

      {/* El degradado hace de placeholder mientras carga y si algo falla. */}
      {!mostrarImagen || !cargada ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-xl opacity-60"
        >
          🌿
        </span>
      ) : null}

      {/* Si no hay imagen que describir, el texto alternativo sigue estando. */}
      {!mostrarImagen ? <span className="sr-only">{alt}</span> : null}
    </div>
  )
}
