// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'
import { Spinner } from './Spinner'

describe('<Card>', () => {
  it('es un div con superficie elevada por defecto', () => {
    render(<Card>Monstera del salón</Card>)
    const card = screen.getByText('Monstera del salón')
    expect(card.tagName).toBe('DIV')
    expect(card).toHaveClass('superficie', 'p-4')
  })

  it('as="section" y as="li" cambian la etiqueta sin romper nada', () => {
    const { rerender } = render(<Card as="section">Ficha</Card>)
    expect(screen.getByText('Ficha').tagName).toBe('SECTION')

    rerender(
      <ul>
        <Card as="li">Monstera</Card>
      </ul>,
    )
    expect(screen.getByText('Monstera').tagName).toBe('LI')
  })

  it('añade la className recibida', () => {
    render(<Card className="mb-3">Monstera</Card>)
    expect(screen.getByText('Monstera').className).toContain('mb-3')
  })
})

describe('<Spinner>', () => {
  it('se anuncia como estado y lleva texto para el lector de pantalla', () => {
    render(<Spinner label="Cargando plantas" />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando plantas')
  })

  it('por defecto dice "Cargando"', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando')
  })

  it('cambia de tamaño', () => {
    const { rerender } = render(<Spinner size="sm" />)
    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('size-4')

    rerender(<Spinner size="lg" />)
    expect(screen.getByRole('status').querySelector('svg')).toHaveClass('size-10')
  })
})
