// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DbProvider } from '@/db/context'
import { createMemoryDb } from '@/db/memory'
import type { FotoProgreso } from '@/types'
import { GaleriaProgreso } from './GaleriaProgreso'
import type { GaleriaProgresoProps } from './GaleriaProgreso'

/** Fotos de mentira: el hook `useFotosProgreso` es quien manda las reales. */
function fotos(n: number): FotoProgreso[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `foto-${i + 1}`,
    fecha: `2026-10-0${n - i}`,
    origen: i === 0 ? ('portada' as const) : ('analisis' as const),
    veredicto: i % 3 === 0 ? ('todo_ok' as const) : undefined,
  }))
}

function montar(props: Partial<GaleriaProgresoProps> = {}) {
  return render(
    <DbProvider db={createMemoryDb()}>
      <GaleriaProgreso fotos={fotos(2)} {...props} />
    </DbProvider>,
  )
}

describe('<GaleriaProgreso>', () => {
  it('con dos fotos se ven las dos con su fecha', () => {
    const { container } = montar({ fotos: fotos(2) })

    expect(container.querySelectorAll('li')).toHaveLength(2)
    // La fecha sale en castellano y corta, no como ISO.
    expect(screen.getByText('2 oct 2026')).toBeInTheDocument()
    expect(screen.getByText('1 oct 2026')).toBeInTheDocument()
  })

  it('con más fotos que `visibles` enseña solo esas y un botón para verlas todas', async () => {
    montar({ fotos: fotos(6), visibles: 4 })

    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    const boton = screen.getByRole('button', { name: 'Ver todas (6)' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')

    // Al pulsarlo se despliega el resto en el sitio: las 6 a la vez.
    await userEvent.click(boton)

    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('con `visibles` por defecto enseña cuatro y no ofrece "ver todas" si no sobran', () => {
    montar({ fotos: fotos(4) })

    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /Ver todas/ })).not.toBeInTheDocument()
  })

  it('sin fotos sale el texto vacío, con su icono', () => {
    montar({ fotos: [], vacio: 'Sin fotos todavía' })

    expect(screen.getByText('Sin fotos todavía')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('el título "Progreso" se puede cambiar', () => {
    montar({ fotos: fotos(2), titulo: 'Cómo ha crecido' })
    expect(screen.getByRole('heading', { name: 'Cómo ha crecido' })).toBeInTheDocument()
  })

  it('onAbrir recibe el id de la foto que se ha tocado', async () => {
    const onAbrir = vi.fn()
    const { container } = montar({ fotos: fotos(2), onAbrir })

    // La más reciente es la primera.
    await userEvent.click(screen.getByRole('button', { name: /Abrir foto del 2 oct 2026/ }))

    expect(onAbrir).toHaveBeenCalledTimes(1)
    expect(onAbrir).toHaveBeenCalledWith('foto-1')
    // La otra foto sigue ahí, sin desaparecer.
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  it('sin onAbrir las fotos no son botones', () => {
    montar({ fotos: fotos(2) })

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('cada foto se abre en su propio objetivo táctil de 44 px', () => {
    const { container } = montar({ fotos: fotos(2), onAbrir: vi.fn() })

    const botones = Array.from(container.querySelectorAll('li button'))
    expect(botones).toHaveLength(2)
    for (const boton of botones) {
      expect(boton.className).toContain('min-h-11')
    }
  })

  it('la tira hace scroll horizontal sin atrapar el de la página', () => {
    const { container } = montar({ fotos: fotos(6) })

    const tira = container.querySelector('ul')
    expect(tira?.className).toContain('overflow-x-auto')
    expect(tira?.className).toContain('snap-x')
    expect(tira?.className).toContain('overscroll-x-contain')
  })

  it('el veredicto se marca con su emoji', () => {
    montar({ fotos: fotos(2) })

    // La primera foto (i=0) lleva veredicto `todo_ok`.
    expect(screen.getAllByText('✅')).toHaveLength(1)
  })

  it('acepta una className propia sin perder el título', () => {
    const { container } = montar({ fotos: fotos(2), className: 'mt-6' })

    expect(container.firstElementChild?.className).toContain('mt-6')
    expect(screen.getByRole('heading', { name: 'Progreso' })).toBeInTheDocument()
  })
})
