// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sheet } from './Sheet'
import { TextInput } from './TextInput'

/** Hoja abierta desde un botón, como en la vida real. */
function HojaConBoton({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir editor
      </button>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false)
          onClose()
        }}
        title="Editar planta"
      >
        <TextInput aria-label="Nombre" defaultValue="Monstera" />
      </Sheet>
    </>
  )
}

describe('<Sheet>', () => {
  it('con open pinta un diálogo modal con su título', () => {
    render(
      <Sheet open onClose={vi.fn()} title="Editar planta">
        <p>Contenido</p>
      </Sheet>,
    )

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toBeInTheDocument()
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    expect(dialogo).toHaveAccessibleName('Editar planta')
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })

  it('cerrada no pinta nada en el documento', () => {
    render(
      <Sheet open={false} onClose={vi.fn()} title="Editar planta">
        <p>Contenido</p>
      </Sheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('se abre y se cierra desde el botón que la llamó', async () => {
    render(<HojaConBoton />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir editor' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Escape cierra la hoja', async () => {
    render(<HojaConBoton />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir editor' }))

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('devuelve el foco al botón que la abrió', async () => {
    render(<HojaConBoton />)
    const abridor = screen.getByRole('button', { name: 'Abrir editor' })

    await userEvent.click(abridor)
    expect(screen.getByRole('dialog')).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(abridor).toHaveFocus()
  })

  it('bloquea el scroll del fondo mientras está abierta', async () => {
    render(<HojaConBoton />)
    expect(document.body.style.overflow).toBe('')

    await userEvent.click(screen.getByRole('button', { name: 'Abrir editor' }))
    expect(document.body.style.overflow).toBe('hidden')

    await userEvent.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('')
  })

  it('muestra el footer con las acciones', () => {
    render(
      <Sheet
        open
        onClose={vi.fn()}
        title="Editar planta"
        footer={
          <button type="button">Guardar</button>
        }
      >
        <p>Contenido</p>
      </Sheet>,
    )
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  })
})
