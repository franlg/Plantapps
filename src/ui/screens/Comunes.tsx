/**
 * PIEZAS COMPARTIDAS DE LAS PANTALLAS
 * ====================================
 * Marcos y cajas que se repiten en todas las pantallas: el contenedor con el
 * ancho del móvil, las filas de datos de una ficha y las franjas de aviso.
 *
 * Reglas que se respetan aquí (ver `src/ui/components/README.md`):
 * - Una sola columna, `max-w-md` centrado.
 * - Nada pulsable por debajo de 44 px.
 * - Textos de 16 px o más y buen contraste en claro y oscuro.
 */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

/** Altura que ocupa la barra inferior, para que no tape el contenido. */
export const ALTURA_BARRA = 'pb-[calc(env(safe-area-inset-bottom)+5.5rem)]'

/**
 * Envoltura de una pantalla completa.
 * El `padding-bottom` deja hueco para la barra de navegación fija.
 */
export function Pantalla({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn('mx-auto w-full max-w-md px-4 pt-4', ALTURA_BARRA, className)}>{children}</main>
  )
}

/** Cabecera de pantalla: título corto y, debajo, el detalle que lo acompaña. */
export function Cabecera({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <header className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{titulo}</h1>
      {detalle ? <p className="mt-0.5 text-sm text-[var(--text-muted)]">{detalle}</p> : null}
    </header>
  )
}

/** Título de una sección dentro de una pantalla. */
export function TituloSeccion({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 text-sm font-semibold tracking-wide text-[var(--text-muted)] uppercase">
      {children}
    </h2>
  )
}

/**
 * Una fila "etiqueta: valor" para las fichas.
 * Pensada para usarse dentro de una `<dl>`.
 */
export function FilaDato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-[var(--text-muted)]">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 text-right text-base font-medium text-[var(--text)] break-words">
        {children}
      </dd>
    </div>
  )
}

/**
 * Iniciales sobre fondo verde para las plantas que todavía no tienen foto.
 * El nombre de la planta siempre está escrito al lado, así que aquí va como adorno.
 */
export function Iniciales({ nombre, className }: { nombre: string; className?: string }) {
  const inicial = [...nombre.trim()][0]?.toUpperCase() ?? '🌱'

  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xl font-bold',
        'from-brand-100 to-brand-300 text-brand-800',
        'dark:from-brand-900 dark:to-brand-700 dark:text-brand-100',
        className,
      )}
    >
      {inicial}
    </div>
  )
}

/**
 * Franja horizontal de aviso (sin conexión, versión nueva).
 * Va pegada arriba del todo y no se va sola nunca: el usuario decide.
 */
export function Franja({
  tono,
  children,
}: {
  tono: 'alerta' | 'neutro' | 'marca'
  children: ReactNode
}) {
  const tonos: Record<'alerta' | 'neutro' | 'marca', string> = {
    alerta: 'bg-alerta-100 text-alerta-900 dark:bg-alerta-900 dark:text-alerta-100',
    neutro: 'bg-[var(--border-soft)] text-[var(--text)]',
    marca: 'bg-brand-100 text-brand-900 dark:bg-brand-900 dark:text-brand-100',
  }

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-center gap-2 px-4 py-2 text-sm font-medium',
        tonos[tono],
      )}
    >
      {children}
    </div>
  )
}

/** Enlace que parece un botón, para salir de la pantalla hacia Ajustes. */
export function BotonEnlace({
  to,
  children,
  className,
}: {
  to: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'tap-target rounded-2xl bg-brand-600 px-4 text-base font-semibold text-white',
        'hover:bg-brand-700 active:bg-brand-800',
        'dark:bg-brand-300 dark:text-brand-900 dark:hover:bg-brand-200',
        className,
      )}
    >
      {children}
    </Link>
  )
}