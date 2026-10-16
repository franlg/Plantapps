// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BotonRegarRapido } from './BotonRegarRapido'

const NOMBRE = 'Monstera del salón'

describe('<BotonRegarRapido>', () => {
  it('muestra "Regar" y explica en el nombre accesible qué hace', () => {
    render(<BotonRegarRapido onClick={vi.fn()} nombrePlanta={NOMBRE} />)

    expect(screen.getByText('Regar')).toBeInTheDocument()
    expect(screen.getByText('💧')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `Registrar que has regado ${NOMBRE}` }),
    ).toBeInTheDocument()
  })

  it('con `cargando` se deshabilita, muestra el spinner y no dispara onClick', async () => {
    const onClick = vi.fn()
    render(<BotonRegarRapido onClick={onClick} nombrePlanta={NOMBRE} cargando />)

    const boton = screen.getByRole('button', { name: `Registrar que has regado ${NOMBRE}` })
    expect(boton).toBeDisabled()
    expect(boton).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toBeInTheDocument()

    await userEvent.click(boton)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('sin `cargando` no sale el spinner ni aria-busy', () => {
    render(<BotonRegarRapido onClick={vi.fn()} nombrePlanta={NOMBRE} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy')
  })

  it('onClick salta al pulsarlo', async () => {
    const onClick = vi.fn()
    render(<BotonRegarRapido onClick={onClick} nombrePlanta={NOMBRE} />)

    await userEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('respeta los 44 px en los dos tamaños y es type="button"', () => {
    const { rerender } = render(<BotonRegarRapido onClick={vi.fn()} nombrePlanta={NOMBRE} size="sm" />)
    const pequeno = screen.getByRole('button')
    expect(pequeno.className).toContain('min-h-11')
    expect(pequeno).toHaveAttribute('type', 'button')

    rerender(<BotonRegarRapido onClick={vi.fn()} nombrePlanta={NOMBRE} size="md" />)
    expect(screen.getByRole('button').className).toContain('min-h-12')
  })

  it('va en color de marca, no de peligro', () => {
    render(<BotonRegarRapido onClick={vi.fn()} nombrePlanta={NOMBRE} />)

    const c = screen.getByRole('button').className
    expect(c).toContain('brand-')
    expect(c).not.toContain('peligro')
  })

  it('acepta una className propia', () => {
    render(<BotonRegarRapido onClick={vi.fn()} nombrePlanta={NOMBRE} className="w-full" />)

    expect(screen.getByRole('button').className).toContain('w-full')
  })
})
