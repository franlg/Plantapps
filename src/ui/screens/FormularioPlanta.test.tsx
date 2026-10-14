import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { FormularioPlanta } from './FormularioPlanta'
import { dbDePrueba, renderConDb, usuario } from './entornoPrueba'

describe('<FormularioPlanta>', () => {
  it('no deja guardar una planta sin nombre', async () => {
    const user = usuario()
    const db = dbDePrueba()
    renderConDb(<FormularioPlanta />, { db, ruta: '/planta/nueva' })

    await user.click(screen.getByRole('button', { name: /Guardar planta/i }))

    expect(await screen.findByText(/ponle un nombre a la planta/i)).toBeInTheDocument()
    expect(await db.plants.list()).toHaveLength(0)
  })

  it('crea la planta con lo que se ha escrito', async () => {
    const user = usuario()
    const db = dbDePrueba()
    renderConDb(<FormularioPlanta />, { db, ruta: '/planta/nueva' })

    await user.type(screen.getByLabelText(/nombre/i), 'Monstera del salón')
    await user.type(screen.getByLabelText(/especie/i), 'Monstera deliciosa')
    await user.type(screen.getByLabelText(/maceta/i), '18 cm')
    await user.click(screen.getByRole('button', { name: /Guardar planta/i }))

    await waitFor(async () => expect(await db.plants.list()).toHaveLength(1))

    const [planta] = await db.plants.list()
    expect(planta?.nombre).toBe('Monstera del salón')
    expect(planta?.especie).toBe('Monstera deliciosa')
    expect(planta?.maceta).toBe('18 cm')
  })

  it('sugiere una frecuencia de riego al escribir la especie', async () => {
    const user = usuario()
    renderConDb(<FormularioPlanta />, { db: dbDePrueba(), ruta: '/planta/nueva' })

    await user.type(screen.getByLabelText(/especie/i), 'Monstera')

    expect(await screen.findByText(/sugerido para monstera/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Usar \d+ días/i }))

    expect(screen.getByLabelText(/cada cuántos días regar/i)).not.toHaveValue(null)
  })

  it('en edición enseña los datos que ya había y los vuelve a guardar', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({
      nombre: 'Poto del pasillo',
      especie: 'Epipremnum aureum',
      frecuenciaRiegoDias: 9,
      luz: 'sol_indirecto',
      notas: 'Se le secan las puntas',
    })

    renderConDb(<FormularioPlanta />, { db, ruta: `/planta/${planta.id}/editar`, patron: '/planta/:id/editar' })

    expect(await screen.findByText('Editar planta')).toBeInTheDocument()
    const nombre = screen.getByLabelText(/nombre/i)
    expect(nombre).toHaveValue('Poto del pasillo')
    expect(screen.getByLabelText(/cada cuántos días regar/i)).toHaveValue(9)

    await user.clear(nombre)
    await user.type(nombre, 'Poto del pasillo grande')
    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await waitFor(async () => {
      const lista = await db.plants.list()
      expect(lista[0]?.nombre).toBe('Poto del pasillo grande')
    })
    expect(await db.plants.list()).toHaveLength(1)
  })

  it('en edición ofrece borrar la planta', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Cactus' })

    renderConDb(<FormularioPlanta />, { db, ruta: `/planta/${planta.id}/editar`, patron: '/planta/:id/editar' })

    expect(await screen.findByRole('button', { name: /Borrar esta planta/i })).toBeInTheDocument()
  })
})