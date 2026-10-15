// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Acordeon } from './Acordeon'

/** El chevron es el único <svg> del acordeón. */
const claseDe = (raiz: HTMLElement) => raiz.querySelector('svg')?.getAttribute('class') ?? ''

describe('<Acordeon>', () => {
  it('muestra el título y esconde el contenido mientras está plegado', () => {
    render(
      <Acordeon titulo="Necesitan agua">
        <p>Monstera · regada hace 5 días</p>
      </Acordeon>,
    )

    expect(screen.getByText('Necesitan agua')).toBeInTheDocument()
    expect(screen.getByText(/Monstera/)).not.toBeVisible()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('al pulsar la cabecera despliega el contenido y al volver a pulsar lo pliega', async () => {
    render(
      <Acordeon titulo="Necesitan agua">
        <p>Monstera · regada hace 5 días</p>
      </Acordeon>,
    )
    const boton = screen.getByRole('button')

    await userEvent.click(boton)

    expect(boton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Monstera/)).toBeVisible()

    await userEvent.click(boton)

    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/Monstera/)).not.toBeVisible()
  })

  it('el contador va a la derecha del título', () => {
    render(
      <Acordeon titulo="Necesitan agua" contador={<span>3</span>}>
        <p>Monstera</p>
      </Acordeon>,
    )

    expect(screen.getByRole('button')).toHaveTextContent('Necesitan agua3')
  })

  it('un contador de 0 también se pinta', () => {
    render(
      <Acordeon titulo="Necesitan agua" contador={0}>
        <p>Monstera</p>
      </Acordeon>,
    )

    expect(screen.getByRole('button')).toHaveTextContent('Necesitan agua0')
  })

  describe('modo controlado', () => {
    it('avisa al padre pero no cambia si el padre no cambia `abierto`', async () => {
      const onToggle = vi.fn()
      render(
        <Acordeon titulo="Necesitan agua" abierto={false} onToggle={onToggle}>
          <p>Monstera</p>
        </Acordeon>,
      )
      const boton = screen.getByRole('button')

      await userEvent.click(boton)

      expect(onToggle).toHaveBeenCalledTimes(1)
      expect(onToggle).toHaveBeenCalledWith(true)
      // El padre manda: sin su cambio, el acordeón sigue plegado.
      expect(boton).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByText('Monstera')).not.toBeVisible()

      await userEvent.click(boton)

      expect(onToggle).toHaveBeenCalledTimes(2)
      // Sigue proponiendo "desplegar": el padre aún no ha cambiado `abierto`.
      expect(onToggle).toHaveBeenLastCalledWith(true)
      expect(screen.getByText('Monstera')).not.toBeVisible()
    })

    it('se despliega cuando el padre cambia `abierto`', () => {
      const { rerender } = render(
        <Acordeon titulo="Necesitan agua" abierto={false} onToggle={vi.fn()}>
          <p>Monstera</p>
        </Acordeon>,
      )
      expect(screen.getByText('Monstera')).not.toBeVisible()

      rerender(
        <Acordeon titulo="Necesitan agua" abierto onToggle={vi.fn()}>
          <p>Monstera</p>
        </Acordeon>,
      )

      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Monstera')).toBeVisible()
    })
  })

  it('el chevron gira al desplegarse y respeta prefers-reduced-motion', async () => {
    const { container } = render(
      <Acordeon titulo="Necesitan agua">
        <p>Monstera</p>
      </Acordeon>,
    )
    const chevron = container.querySelector('svg')

    expect(chevron).toHaveAttribute('aria-hidden', 'true')
    expect(chevron).toHaveAttribute('focusable', 'false')
    expect(claseDe(container)).toContain('motion-reduce:transition-none')
    expect(claseDe(container)).not.toContain('rotate-180')

    await userEvent.click(screen.getByRole('button'))

    expect(claseDe(container)).toContain('rotate-180')
  })

  it('el botón controla un panel identificado y etiquetado', () => {
    render(
      <Acordeon titulo="Necesitan agua" abierto>
        <p>Monstera</p>
      </Acordeon>,
    )
    const boton = screen.getByRole('button')
    const panelId = boton.getAttribute('aria-controls')

    expect(panelId).toBeTruthy()

    const panel = document.getElementById(panelId ?? '')
    expect(panel).not.toBeNull()
    expect(panel).toHaveAttribute('role', 'region')
    expect(panel).toHaveAttribute('aria-labelledby', boton.id)
    expect(screen.getByRole('region')).toHaveAttribute('id', panelId)
  })

  it('la cabecera es un botón de 44 px con la etiqueta para lectores de pantalla', () => {
    render(
      <Acordeon titulo="Necesitan agua" etiqueta="Desplegar las plantas secas" abierto={false}>
        <p>Monstera</p>
      </Acordeon>,
    )
    const boton = screen.getByRole('button', { name: /desplegar las plantas secas/i })

    expect(boton).toHaveClass('tap-target')
  })

  it.each(['neutro', 'ok', 'alerta', 'peligro'] as const)('el tono %s pinta su color', (tono) => {
    const { container } = render(
      <Acordeon titulo="Necesitan agua" tono={tono}>
        <p>Monstera</p>
      </Acordeon>,
    )
    const raiz = container.firstElementChild as HTMLElement
    // La cabecera lleva el velo de color y el borde lo lleva la raíz.
    const clase = `${raiz.className} ${claseDe(container)}`

    if (tono === 'neutro') {
      expect(clase).not.toContain('ok-')
      expect(clase).not.toContain('alerta-')
      expect(clase).not.toContain('peligro-')
    } else {
      expect(clase).toContain(`${tono}-`)
      // Visible también en modo oscuro: ahí la franja usa el tono 300.
      expect(clase).toContain(`dark:border-l-${tono}-300`)
    }
  })

  it('se abre y se cierra con el teclado', async () => {
    render(
      <Acordeon titulo="Necesitan agua">
        <p>Monstera</p>
      </Acordeon>,
    )
    const boton = screen.getByRole('button')

    boton.focus()
    await userEvent.keyboard('{Enter}')

    expect(boton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Monstera')).toBeVisible()

    await userEvent.keyboard(' ')

    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Monstera')).not.toBeVisible()
  })

  it('añade la className que le pasen', () => {
    render(
      <Acordeon titulo="Necesitan agua" className="mb-3">
        <p>Monstera</p>
      </Acordeon>,
    )

    const raiz = document.querySelector('section')
    expect(raiz?.className).toContain('mb-3')
  })
})