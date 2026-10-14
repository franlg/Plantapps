/**
 * NAVEGACIÓN
 * ==========
 * Las rutas de la app y la barra de abajo.
 *
 * Dos destinos y un botón de añadir en el centro. La IA no ocupa sitio en la
 * barra a propósito: vive dentro de cada planta, que es donde tiene sentido.
 * El contenido de cada pantalla deja hueco abajo (`ALTURA_BARRA`) para que la
 * barra, que es fija, no tape nada.
 */

import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Button, EmptyState } from '@/ui/components'
import { Ajustes } from '@/ui/screens/Ajustes'
import { Pantalla } from '@/ui/screens/Comunes'
import { DetallePlanta } from '@/ui/screens/DetallePlanta'
import { FormularioPlanta } from '@/ui/screens/FormularioPlanta'
import { Inicio } from '@/ui/screens/Inicio'

/** Pantalla para una ruta que no existe. */
function NoEncontrada() {
  const navegar = useNavigate()
  return (
    <Pantalla>
      <EmptyState
        icono="🧭"
        title="Esta pantalla no existe"
        description="El enlace puede estar mal escrito o la planta ya no estar."
        action={<Button onClick={() => navegar('/')}>Ir al inicio</Button>}
      />
    </Pantalla>
  )
}

/**
 * Tabla de rutas. `react-router-dom` puntúa las rutas por especificidad, pero
 * `/planta/nueva` va declarada antes que `/planta/:id` para que se entienda
 * leyendo el código de arriba abajo.
 */
export function RutasApp() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/planta/nueva" element={<FormularioPlanta />} />
      <Route path="/planta/:id/editar" element={<FormularioPlanta />} />
      <Route path="/planta/:id" element={<DetallePlanta />} />
      <Route path="/ajustes" element={<Ajustes />} />
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  )
}

/** Un destino de la barra: icono, texto y el toque de 44 px. */
function Destino({
  to,
  icono,
  texto,
  fin,
}: {
  to: string
  icono: string
  texto: string
  /** `end` en la raíz, para que Inicio no esté activo en todas las pantallas. */
  fin?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={fin}
      className={({ isActive }) =>
        cn(
          'tap-target min-h-12 w-full flex-col gap-0.5 rounded-2xl px-2 py-1 text-xs font-semibold',
          'transition-colors',
          isActive ? 'text-brand-700 dark:text-brand-200' : 'text-[var(--text-muted)]',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span aria-hidden="true" className={cn('text-xl leading-6', isActive && 'scale-110')}>
            {icono}
          </span>
          <span>{texto}</span>
        </>
      )}
    </NavLink>
  )
}

/**
 * Barra inferior fija: Inicio, añadir (la acción de la app) y Ajustes.
 * Se dibuja sobre el contenido, así que vive en su propio `z`.
 */
export function BarraNavegacion() {
  const navegar = useNavigate()

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-soft)]',
        'bg-[var(--surface-raised)] shadow-[0_-2px_12px_rgba(0,0,0,0.06)]',
        'area-segura-abajo',
      )}
    >
      <div className="mx-auto grid max-w-md grid-cols-3 items-center gap-1 px-3 pt-1.5 pb-1">
        <Destino to="/" icono="🏠" texto="Inicio" fin />

        {/*
          El botón de añadir va en el centro, entre los dos destinos. Ese mismo
          orden es el del tabulador, así que con teclado se recorre igual que
          con el dedo: Inicio → Añadir → Ajustes.
        */}
        <button
          type="button"
          onClick={() => navegar('/planta/nueva')}
          aria-label="Añadir planta"
          className={cn(
            'tap-icono mx-auto -mt-7 size-14',
            'rounded-full bg-brand-600 text-white shadow-lg',
            'hover:bg-brand-700 active:bg-brand-800',
            'dark:bg-brand-300 dark:text-brand-900 dark:hover:bg-brand-200',
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-7"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <Destino to="/ajustes" icono="⚙️" texto="Ajustes" />
      </div>
    </nav>
  )
}