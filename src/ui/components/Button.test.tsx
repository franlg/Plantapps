// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('<Button>', () => {
  it('muestra el texto y llama a onClick al pulsarlo', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Regar</Button>)

    const boton = screen.getByRole('button', { name: 'Regar' })
    expect(boton).toBeEnabled()

    await userEvent.click(boton)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('arranca siendo type="button" para no enviar formularios por accidente', () => {
    render(<Button>Guardar</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('acepta type="submit" dentro de un formulario', () => {
    render(
      <form>
        <Button type="submit">Guardar</Button>
      </form>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('con loading se deshabilita, marca aria-busy y no dispara onClick', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Guardando
      </Button>,
    )

    const boton = screen.getByRole('button', { name: /guardando/i })
    expect(boton).toBeDisabled()
    expect(boton).toHaveAttribute('aria-busy', 'true')

    await userEvent.click(boton)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('sin loading no lleva aria-busy', () => {
    render(<Button>Guardar</Button>)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy')
  })

  it('disabled no deja pulsar', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    )

    const boton = screen.getByRole('button')
    expect(boton).toBeDisabled()
    await userEvent.click(boton)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('aplica la variante y el tamaño pedidos en className', () => {
    const { rerender } = render(<Button variant="danger">Borrar</Button>)
    expect(screen.getByRole('button').className).toContain('peligro')

    rerender(
      <Button variant="secondary" size="lg" fullWidth>
        Cancelar
      </Button>,
    )
    const boton = screen.getByRole('button')
    expect(boton.className).toContain('min-h-14')
    expect(boton.className).toContain('w-full')
  })

  it('deja su className propia al final para poder ajustar márgenes', () => {
    render(<Button className="mt-4">Guardar</Button>)
    const boton = screen.getByRole('button')
    expect(boton.className).toContain('tap-target')
    expect(boton.className.endsWith('mt-4')).toBe(true)
  })
})
