// Tipos de los matchers de jest-dom sobre el `expect` de Vitest.
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateInput } from './DateInput'
import { Field } from './Field'
import { Select } from './Select'
import { TextArea } from './TextArea'
import { TextInput } from './TextInput'

describe('Campos de formulario', () => {
  it('TextInput es un input de una línea con la clase común', () => {
    render(<TextInput placeholder="Monstera" defaultValue="Ficus" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('campo')
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByPlaceholderText('Monstera')).toBe(input)
  })

  it('TextArea es un textarea que se puede redimensionar', () => {
    render(<TextArea placeholder="Notas" />)
    expect(screen.getByRole('textbox')).toHaveClass('campo', 'campo-textarea')
  })

  it('Select pinta una opción por cada elemento de options', async () => {
    const onChange = vi.fn()
    render(
      <Select
        options={[
          { value: '', label: 'Sin especificar' },
          { value: 'sol_directo', label: 'Sol directo' },
          { value: 'sombra', label: 'Sombra' },
        ]}
        defaultValue="sombra"
        onChange={onChange}
      />,
    )

    const select = screen.getByRole('combobox')
    expect(select).toHaveClass('campo', 'campo-select')
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(select).toHaveValue('sombra')

    await userEvent.selectOptions(select, 'sol_directo')
    expect(onChange).toHaveBeenCalled()
  })

  it('DateInput es un input type=date con valor YYYY-MM-DD', () => {
    render(
      <Field label="Fecha de riego" htmlFor="fecha">
        <DateInput id="fecha" defaultValue="2026-10-14" />
      </Field>,
    )

    const input = screen.getByLabelText('Fecha de riego')
    expect(input).toHaveAttribute('type', 'date')
    expect(input).toHaveValue('2026-10-14')
  })

  it('aceptan className y atributos nativos', () => {
    render(<TextInput className="mt-2" name="nombre" required />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('campo')
    expect(input).toHaveAttribute('name', 'nombre')
    expect(input).toBeRequired()
  })
})
