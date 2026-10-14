/**
 * UTILIDADES PARA LAS PRUEBAS DE PANTALLAS
 * =========================================
 * Monta una pantalla dentro de `<DbProvider>` y de un router de memoria, con una
 * base de datos en memoria nueva por prueba. Nada de esto se usa en la app.
 */

import type { ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { createMemoryDb } from '@/db'
import { DbProvider } from '@/db/context'
import type { Db } from '@/services/contracts'

/** Un ISO datetime de hace `dias` días. */
export function haceDias(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString()
}

export interface OpcionesPantalla {
  /** Base de datos en memoria de la prueba. */
  db: Db
  /** URL en la que se entra. */
  ruta: string
  /** Patrón de ruta de la pantalla. Por defecto, la propia `ruta`. */
  patron?: string
}

/** Texto que aparece cuando la navegación ha salido de la pantalla probada. */
export const MARCA_DE_FUERA = 'Otra pantalla'

/** Monta la pantalla y devuelve el resultado de `render`. */
export function renderConDb(elemento: ReactElement, { db, ruta, patron }: OpcionesPantalla): RenderResult {
  return render(
    <DbProvider db={db}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path={patron ?? ruta} element={elemento} />
          <Route path="*" element={<p>{MARCA_DE_FUERA}</p>} />
        </Routes>
      </MemoryRouter>
    </DbProvider>,
  )
}

/** Base de datos nueva para cada prueba. */
export function dbDePrueba(): Db {
  return createMemoryDb()
}

/** `userEvent` ya configurado, con el teclado y el puntero. */
export function usuario() {
  return userEvent.setup()
}

export interface EspiaObjectURL {
  createObjectURL: ReturnType<typeof vi.fn>
  revokeObjectURL: ReturnType<typeof vi.fn>
  restore: () => void
}

/**
 * jsdom no implementa `URL.createObjectURL`. Se define aquí para poder
 * comprobar que la exportación de la copia crea un archivo de verdad.
 */
export function espiarObjectURL(): EspiaObjectURL {
  const previoCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const previoRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')

  const createObjectURL = vi.fn(() => 'blob:plantapps-copia')
  const revokeObjectURL = vi.fn(() => undefined)

  Object.defineProperty(URL, 'createObjectURL', {
    value: createObjectURL,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: revokeObjectURL,
    configurable: true,
    writable: true,
  })

  return {
    createObjectURL,
    revokeObjectURL,
    restore: () => {
      if (previoCreate) Object.defineProperty(URL, 'createObjectURL', previoCreate)
      else Reflect.deleteProperty(URL, 'createObjectURL')

      if (previoRevoke) Object.defineProperty(URL, 'revokeObjectURL', previoRevoke)
      else Reflect.deleteProperty(URL, 'revokeObjectURL')
    },
  }
}