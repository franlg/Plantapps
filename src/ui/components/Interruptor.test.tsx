import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Interruptor } from './Interruptor'

describe('<Interruptor>', () => {
  it('se anuncia como activado o desactivado, no como pulsado', () => {
    const { rerender } = render(<Interruptor activo etiqueta="Avisarme cuando toque regar" onChange={vi.fn()} />)

    const boton = screen.getByRole('switch', { name: 'Avisarme cuando toque regar' })
    expect(boton).toHaveAttribute('aria-checked', 'true')

    rerender(<Interruptor activo={false} etiqueta="Avisarme cuando toque regar" onChange={vi.fn()} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('avisa del estado contrario al pulsarlo', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Interruptor activo={false} etiqueta="Comparar con la foto anterior" onChange={onChange} />)
    await user.click(screen.getByRole('switch'))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('al estar encendido, avisa de que se quiere apagar', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Interruptor activo etiqueta="Recordatorios" onChange={onChange} />)
    await user.click(screen.getByRole('switch'))

    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('deshabilitado no hace nada, para no prometer lo que no puede cumplir', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Interruptor activo etiqueta="Notificaciones" deshabilitado onChange={onChange} />)
    const boton = screen.getByRole('switch')
    expect(boton).toBeDisabled()

    await user.click(boton)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('es alcanzable con el teclado', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<Interruptor activo={false} etiqueta="Tema oscuro" onChange={onChange} />)

    await user.tab()
    expect(screen.getByRole('switch')).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith(true)
  })
})