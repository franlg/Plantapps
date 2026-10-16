// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TarjetaComparacion } from './TarjetaComparacion'

/** Las clases de color están en la tarjeta, que es el primer elemento. */
function clasesDe(contenedor: HTMLElement): string {
  return contenedor.firstElementChild?.className ?? ''
}

describe('<TarjetaComparacion>', () => {
  it('"ha mejorado" se pinta en tono ok y muestra el detalle', () => {
    const { container } = render(
      <TarjetaComparacion
        tendencia="mejor"
        detalle="Han salido dos hojas nuevas y el color es más verde."
        comparable
      />,
    )

    expect(screen.getByText('Ha mejorado')).toBeInTheDocument()
    expect(screen.getByText('📈')).toBeInTheDocument()
    expect(
      screen.getByText('Han salido dos hojas nuevas y el color es más verde.'),
    ).toBeInTheDocument()

    const c = clasesDe(container)
    expect(c).toContain('ok-')
    // Y también en oscuro, para que no se pierda el color.
    expect(c).toContain('dark:bg-ok-900')
  })

  it('"ha empeorado" se pinta en tono alerta, también en oscuro', () => {
    const { container } = render(
      <TarjetaComparacion tendencia="peor" detalle="Las puntas de las hojas se están secando." comparable />,
    )

    expect(screen.getByText('Ha empeorado')).toBeInTheDocument()
    const c = clasesDe(container)
    expect(c).toContain('alerta-')
    expect(c).toContain('dark:bg-alerta-900')
    expect(c).not.toContain('ok-')
  })

  it('"sigue igual" se pinta en tono neutro', () => {
    const { container } = render(
      <TarjetaComparacion tendencia="igual" detalle="Ni mejor ni peor." comparable />,
    )

    expect(screen.getByText('Sigue igual')).toBeInTheDocument()
    expect(screen.getByText('➖')).toBeInTheDocument()
    const c = clasesDe(container)
    expect(c).toContain('var(--border-soft)')
    expect(c).not.toContain('ok-')
    expect(c).not.toContain('alerta-')
  })

  it('si no pudo comparar, se ve neutra y lo explica sin fingir que sigue igual', () => {
    const { container } = render(
      <TarjetaComparacion tendencia="igual" detalle="No había foto anterior con la que comparar." comparable={false} />,
    )

    // Nada de "Sigue igual": sería mentir.
    expect(screen.queryByText('Sigue igual')).not.toBeInTheDocument()
    expect(screen.getByText('Sin comparación')).toBeInTheDocument()

    expect(
      screen.getByText(
        'No he podido comparar con la foto anterior: el ángulo, la luz o la hora eran distintos.',
      ),
    ).toBeInTheDocument()

    const c = clasesDe(container)
    expect(c).not.toContain('ok-')
    expect(c).not.toContain('alerta-')
    expect(c).toContain('var(--border-soft)')

    // El detalle sigue contando lo que ha pasado.
    expect(screen.getByText('No había foto anterior con la que comparar.')).toBeInTheDocument()
  })

  it('el detalle se muestra entero', () => {
    const detalle =
      'Se ve más tupida que en la foto anterior, aunque las hojas de abajo siguen un poco amarillas.'

    const { container } = render(<TarjetaComparacion tendencia="mejor" detalle={detalle} comparable />)

    expect(screen.getByText(detalle)).toBeInTheDocument()
    expect(clasesDe(container)).toContain('ok-')
  })

  it('acepta una className propia', () => {
    const { container } = render(
      <TarjetaComparacion tendencia="mejor" detalle="Mejor." comparable className="mt-3" />,
    )

    expect(clasesDe(container)).toContain('mt-3')
  })
})
