// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EstadoRiegoChip } from './EstadoRiegoChip'
import { VeredictoChip } from './VeredictoChip'

/**
 * El texto va dentro del <span> del emoji, así que las clases de la pastilla
 * están un nivel más arriba.
 */
function clasesDeLaPastilla(texto: string): string {
  return screen.getByText(texto).parentElement?.className ?? ''
}

describe('<EstadoRiegoChip>', () => {
  it('usa la etiqueta traducida de cada estado', () => {
    const { rerender } = render(<EstadoRiegoChip estado="nunca_regada" />)
    expect(screen.getByText('Nunca regada')).toBeInTheDocument()

    rerender(<EstadoRiegoChip estado="al_dia" />)
    expect(screen.getByText('Al día')).toBeInTheDocument()

    rerender(<EstadoRiegoChip estado="proximo" />)
    expect(screen.getByText('Toca pronto')).toBeInTheDocument()

    rerender(<EstadoRiegoChip estado="vencido" />)
    expect(screen.getByText('Riego vencido')).toBeInTheDocument()
  })

  it('colorea según la urgencia', () => {
    const { rerender } = render(<EstadoRiegoChip estado="al_dia" />)
    expect(clasesDeLaPastilla('Al día')).toContain('ok-100')

    rerender(<EstadoRiegoChip estado="proximo" />)
    expect(clasesDeLaPastilla('Toca pronto')).toContain('alerta-100')

    rerender(<EstadoRiegoChip estado="vencido" />)
    expect(clasesDeLaPastilla('Riego vencido')).toContain('peligro-100')

    rerender(<EstadoRiegoChip estado="nunca_regada" />)
    expect(clasesDeLaPastilla('Nunca regada')).toContain('var(--border-soft)')
  })

  it('con retraso, dice cuántos días lleva', () => {
    render(<EstadoRiegoChip estado="vencido" diasParaRiego={-3} />)
    expect(screen.getByText('· 3 días de retraso')).toBeInTheDocument()
  })

  it('si toca pronto, dice cuándo', () => {
    const { rerender } = render(<EstadoRiegoChip estado="proximo" diasParaRiego={0} />)
    expect(screen.getByText('· Hoy')).toBeInTheDocument()

    rerender(<EstadoRiegoChip estado="proximo" diasParaRiego={1} />)
    expect(screen.getByText('· Mañana')).toBeInTheDocument()

    rerender(<EstadoRiegoChip estado="proximo" diasParaRiego={4} />)
    expect(screen.getByText('· En 4 días')).toBeInTheDocument()
  })

  it('sin días no inventa detalle', () => {
    render(<EstadoRiegoChip estado="proximo" />)
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })
})

describe('<VeredictoChip>', () => {
  it('muestra el emoji y la etiqueta del veredicto', () => {
    render(<VeredictoChip veredicto="regar" />)
    expect(screen.getByText('💧')).toBeInTheDocument()
    expect(screen.getByText('Regar')).toBeInTheDocument()
  })

  it('colorea bien lo bueno y lo malo', () => {
    const { rerender } = render(<VeredictoChip veredicto="todo_ok" />)
    expect(clasesDeLaPastilla('Todo correcto')).toContain('ok-100')

    rerender(<VeredictoChip veredicto="no_regar" />)
    expect(clasesDeLaPastilla('No regar')).toContain('ok-100')

    rerender(<VeredictoChip veredicto="regar" />)
    expect(clasesDeLaPastilla('Regar')).toContain('brand-100')

    rerender(<VeredictoChip veredicto="trasplantar" />)
    expect(clasesDeLaPastilla('Trasplantar')).toContain('alerta-100')

    rerender(<VeredictoChip veredicto="problema" />)
    expect(clasesDeLaPastilla('Tiene un problema')).toContain('peligro-100')
  })
})
