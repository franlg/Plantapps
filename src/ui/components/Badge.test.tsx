// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

describe('<Badge>', () => {
  it('muestra el texto dentro de una pastilla', () => {
    render(<Badge>Nueva</Badge>)
    const badge = screen.getByText('Nueva')
    expect(badge).toBeInTheDocument()
    expect(badge.tagName).toBe('SPAN')
  })

  it('sin tone usa el tono neutro', () => {
    render(<Badge>Nueva</Badge>)
    expect(screen.getByText('Nueva').className).toContain('var(--border-soft)')
  })

  it.each([
    ['ok', 'ok-100'],
    ['alerta', 'alerta-100'],
    ['peligro', 'peligro-100'],
    ['marca', 'brand-100'],
    ['neutro', 'var(--border-soft)'],
  ] as const)('el tono %s usa su color', (tone, esperado) => {
    render(<Badge tone={tone}>Texto</Badge>)
    expect(screen.getByText('Texto').className).toContain(esperado)
  })

  it('acepta contenido con emoji, como los chips', () => {
    render(
      <Badge tone="ok">
        <span aria-hidden="true">✅</span> Al día
      </Badge>,
    )
    expect(screen.getByText(/al día/i)).toBeInTheDocument()
  })

  it('añade la className que le pasen', () => {
    render(<Badge className="mr-2">Riego</Badge>)
    expect(screen.getByText('Riego').className).toContain('mr-2')
  })
})
