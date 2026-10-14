// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

describe('<EmptyState>', () => {
  it('muestra icono, título y descripción', () => {
    render(
      <EmptyState
        icono="🪴"
        title="Aún no tienes plantas"
        description="Empieza por añadir la primera."
      />,
    )

    expect(screen.getByRole('heading', { name: 'Aún no tienes plantas' })).toBeInTheDocument()
    expect(screen.getByText('Empieza por añadir la primera.')).toBeInTheDocument()
    expect(screen.getByText('🪴')).toBeInTheDocument()
  })

  it('la descripción es opcional', () => {
    render(<EmptyState icono="🌿" title="Sin historial" />)
    expect(screen.getByRole('heading', { name: 'Sin historial' })).toBeInTheDocument()
  })

  it('el icono queda escondido para el lector de pantalla', () => {
    const { container } = render(<EmptyState icono="🌿" title="Nada por aquí" />)
    const zona = container.querySelector('[aria-hidden="true"]')
    expect(zona).toHaveTextContent('🌿')
  })

  it('permite pasar una acción y esta funciona', async () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        icono="📸"
        title="Sin análisis"
        description="Haz una foto para saber cómo está."
        action={<Button onClick={onClick}>Analizar</Button>}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Analizar' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
