import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { Ajustes } from './Ajustes'
import { dbDePrueba, espiarObjectURL, renderConDb, usuario } from './entornoPrueba'

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')
  window.localStorage.clear()
})

describe('<Ajustes>', () => {
  it('avisa de que falta la clave y no la enseña en claro', async () => {
    const db = dbDePrueba()
    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

    expect(await screen.findByText(/Falta la clave/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Pega aquí tu clave/i)).toHaveAttribute('type', 'password')
  })

  it('guarda la clave en la base de datos sin dejar de escribirse en pantalla', async () => {
    const user = usuario()
    const db = dbDePrueba()
    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

    const campo = screen.getByLabelText(/Pega aquí tu clave/i)
    await user.type(campo, 'AIza-mi-clave')
    await user.click(screen.getByRole('button', { name: /Guardar clave/i }))

    await waitFor(async () => expect((await db.settings.get()).apiKey).toBe('AIza-mi-clave'))
    expect(await screen.findByText(/Clave configurada/i)).toBeInTheDocument()
    // El campo se vacía: la clave no se queda escrita a la vista.
    expect(campo).toHaveValue('')
  })

  it('exporta una copia de seguridad como archivo JSON descargable', async () => {
    const user = usuario()
    const db = dbDePrueba()
    await db.plants.create({ nombre: 'Cactus del despacho' })

    const espia = espiarObjectURL()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    try {
      renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

      await user.click(await screen.findByRole('button', { name: /Exportar copia/i }))

      await waitFor(() => expect(espia.createObjectURL).toHaveBeenCalledTimes(1))

      const [blob] = espia.createObjectURL.mock.calls[0] as [Blob]
      expect(blob.type).toBe('application/json')
      expect(click).toHaveBeenCalledTimes(1)

      const copia = JSON.parse(await blob.text()) as { formato: string; plants: unknown[] }
      expect(copia.formato).toBe('plantapps-backup')
      expect(copia.plants).toHaveLength(1)

      await waitFor(async () => expect((await db.settings.get()).ultimaCopia).toBeTruthy())
      expect(espia.revokeObjectURL).toHaveBeenCalled()
    } finally {
      espia.restore()
    }
  })

  it('avisa antes de sobrescribir y reconoce una copia de Plantapps', async () => {
    const user = usuario()
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    const campo = screen.getByLabelText('Archivo de copia de seguridad')

    await user.upload(
      campo,
      new File(['{"formato":"plantapps-backup","plants":[{"nombre":"Helecho"}]}'], 'copia.json', {
        type: 'application/json',
      }),
    )

    expect(await screen.findByText('¿Restaurar esta copia?')).toBeInTheDocument()
    expect(screen.getByText(/trae 1 planta/)).toBeInTheDocument()
    expect(screen.getByText(/se borra todo lo que hay ahora/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('¿Restaurar esta copia?')).not.toBeInTheDocument()
  })

  it('dice que un archivo que no es suyo no parece una copia', async () => {
    const user = usuario()
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    await user.upload(
      screen.getByLabelText('Archivo de copia de seguridad'),
      new File(['{"hola":"que tal"}'], 'notas.json', { type: 'application/json' }),
    )

    expect(await screen.findByText('Este archivo no parece una copia')).toBeInTheDocument()
    expect(screen.getByText(/no lleva la marca de una copia de Plantapps/i)).toBeInTheDocument()
  })

  it('cambia entre tema claro y oscuro y lo recuerda', async () => {
    const user = usuario()
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    await user.click(await screen.findByRole('radio', { name: 'Oscuro' }))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('tema')).toBe('oscuro')

    await user.click(screen.getByRole('radio', { name: 'Claro' }))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem('tema')).toBe('claro')
  })

  it('restaura una planta archivada', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Oreja de elefante' })
    await db.plants.setArchivada(planta.id, true)

    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

    await user.click(await screen.findByRole('button', { name: /Restaurar/i }))

    await waitFor(async () => expect(await db.plants.list()).toHaveLength(1))
    expect(planta.nombre).toBe('Oreja de elefante')
  })

  it('explica que todo vive en el dispositivo', async () => {
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    expect(await screen.findByText(/se guardan solo en este dispositivo/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /aistudio\.google\.com\/apikey/i })).toHaveAttribute(
      'href',
      'https://aistudio.google.com/apikey',
    )
  })
})