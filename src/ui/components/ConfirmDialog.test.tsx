// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

const PROPS = {
  open: true,
  title: '¿Borrar la Monstera?',
  message: 'Se borrarán sus 12 riegos y su foto. No se puede deshacer.',
  confirmLabel: 'Sí, borrar',
  cancelLabel: 'Mejor no',
}

describe('<ConfirmDialog>', () => {
  it('no pinta nada si está cerrada', () => {
    render(<ConfirmDialog {...PROPS} open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('muestra el título y el mensaje de confirmación', () => {
    render(<ConfirmDialog {...PROPS} onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Borrar la Monstera?' })).toBeInTheDocument()
    expect(screen.getByText(/se borrarán sus 12 riegos/i)).toBeInTheDocument()
  })

  it('llama a onConfirm al pulsar el botón de confirmar', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog {...PROPS} onConfirm={onConfirm} onCancel={onCancel} />)

    await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('llama a onCancel al pulsar el botón de cancelar', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog {...PROPS} onConfirm={onConfirm} onCancel={onCancel} />)

    await userEvent.click(screen.getByRole('button', { name: 'Mejor no' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('destructive pinta el botón de confirmar en rojo', () => {
    render(<ConfirmDialog {...PROPS} destructive onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Sí, borrar' }).className).toContain('peligro')
  })

  it('sin destructive el botón de confirmar no es rojo', () => {
    render(<ConfirmDialog {...PROPS} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Sí, borrar' }).className).not.toContain('peligro')
  })

  it('la ✕ también cancela', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...PROPS} onConfirm={vi.fn()} onCancel={onCancel} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
