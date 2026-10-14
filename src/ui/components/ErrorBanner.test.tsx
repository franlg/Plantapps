// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBanner } from './ErrorBanner'

describe('<ErrorBanner>', () => {
  it('se anuncia con role="alert" y enseña el título', () => {
    render(<ErrorBanner title="No se ha podido guardar" message="Sin espacio en el dispositivo" />)

    const aviso = screen.getByRole('alert')
    expect(aviso).toHaveTextContent('No se ha podido guardar')
    expect(aviso).toHaveTextContent('Sin espacio en el dispositivo')
  })

  it('el mensaje es opcional', () => {
    render(<ErrorBanner title="Algo ha fallado" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Algo ha fallado')
  })

  it('ofrece reintentar si le pasan la función', async () => {
    const onRetry = vi.fn()
    render(<ErrorBanner title="Fallo de red" onRetry={onRetry} />)

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('ofrece cerrar si le pasan la función', async () => {
    const onDismiss = vi.fn()
    render(<ErrorBanner title="Fallo de red" onDismiss={onDismiss} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('sin acciones no pinta botones', () => {
    render(<ErrorBanner title="Fallo de red" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
