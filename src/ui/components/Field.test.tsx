// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field } from './Field'
import { TextInput } from './TextInput'

describe('<Field>', () => {
  it('conecta la etiqueta con el control', () => {
    render(
      <Field label="Nombre" htmlFor="nombre">
        <TextInput id="nombre" />
      </Field>,
    )

    expect(screen.getByLabelText('Nombre')).toBe(screen.getByRole('textbox'))
  })

  it('inventa el id si no se le pasa y enlaza igual', () => {
    render(
      <Field label="Especie">
        <TextInput />
      </Field>,
    )

    const input = screen.getByRole('textbox')
    expect(screen.getByText('Especie').getAttribute('for')).toBe(input.id)
    expect(input.id).toBeTruthy()
  })

  it('muestra la ayuda y la enlaza con aria-describedby', () => {
    render(
      <Field label="Maceta" hint="Por ejemplo: maceta de 18 cm">
        <TextInput />
      </Field>,
    )

    const ayuda = screen.getByText('Por ejemplo: maceta de 18 cm')
    expect(ayuda).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', ayuda.id)
  })

  it('muestra el error con role="alert" y marca el campo como inválido', () => {
    render(
      <Field label="Nombre" error="Ponle un nombre a la planta">
        <TextInput />
      </Field>,
    )

    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Ponle un nombre a la planta')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', error.id)
  })

  it('con hint y error a la vez, el control apunta a los dos', () => {
    render(
      <Field label="Nombre" hint="Como la llamas en casa" error="Falta el nombre">
        <TextInput />
      </Field>,
    )

    const described = screen.getByRole('textbox').getAttribute('aria-describedby') ?? ''
    expect(described.split(' ')).toHaveLength(2)
    expect(screen.getByRole('alert')).toHaveTextContent('Falta el nombre')
    expect(screen.getByText('Como la llamas en casa')).toBeInTheDocument()
  })

  it('sin error no hay role="alert"', () => {
    render(
      <Field label="Nombre" hint="Opcional">
        <TextInput />
      </Field>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid')
  })

  it('marca los campos obligatorios y lo dice en texto', () => {
    render(
      <Field label="Nombre" required>
        <TextInput />
      </Field>,
    )

    expect(screen.getByRole('textbox')).toHaveAttribute('aria-required', 'true')
    expect(screen.getByText('(obligatorio)')).toBeInTheDocument()
  })

  it('deja los children intactos si no son un control', () => {
    render(
      <Field label="Grupo">
        <div>contenido libre</div>
      </Field>,
    )
    expect(screen.getByText('contenido libre')).toBeInTheDocument()
  })
})
