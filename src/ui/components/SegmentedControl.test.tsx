// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentedControl } from './SegmentedControl'

type Vista = 'lista' | 'calendario'

const OPCIONES: Array<{ value: Vista; label: string }> = [
  { value: 'lista', label: 'Lista' },
  { value: 'calendario', label: 'Calendario' },
]

function Control({ inicial = 'lista' }: { inicial?: Vista }) {
  const [valor, setValor] = useState<Vista>(inicial)
  return (
    <SegmentedControl value={valor} options={OPCIONES} onChange={setValor} ariaLabel="Vista" />
  )
}

describe('<SegmentedControl>', () => {
  it('es un grupo de opciones con la elegida marcada', () => {
    render(<Control />)

    expect(screen.getByRole('radiogroup', { name: 'Vista' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Lista' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Calendario' })).not.toBeChecked()
  })

  it('cambia de opción al pulsarla', async () => {
    render(<Control />)

    await userEvent.click(screen.getByRole('radio', { name: 'Calendario' }))

    expect(screen.getByRole('radio', { name: 'Calendario' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Lista' })).not.toBeChecked()
  })

  it('avisa con onChange del valor', async () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        value="lista"
        options={OPCIONES}
        onChange={onChange}
        ariaLabel="Vista"
      />,
    )

    await userEvent.click(screen.getByRole('radio', { name: 'Calendario' }))
    expect(onChange).toHaveBeenCalledWith('calendario')
  })

  it('se recorre con las flechas del teclado', async () => {
    render(<Control />)

    screen.getByRole('radio', { name: 'Lista' }).focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(screen.getByRole('radio', { name: 'Calendario' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Calendario' })).toHaveFocus()

    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Lista' })).toBeChecked()
  })

  it('solo la opción activa entra en el recorrido del tabulador', () => {
    render(<Control />)
    expect(screen.getByRole('radio', { name: 'Lista' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Calendario' })).toHaveAttribute('tabindex', '-1')
  })
})
