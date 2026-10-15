import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { toIsoDate } from '@/lib/dates'
import { FormularioPlanta } from './FormularioPlanta'
import { dbDePrueba, renderConDb, usuario } from './entornoPrueba'

/** Nota con la que el formulario marca el riego que él mismo crea o actualiza. */
const NOTA_RIEGO = 'Riego registrado al dar de alta la planta'

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

describe('<FormularioPlanta>: el último riego va al historial, no a la planta', () => {
  it('al dar de alta con fecha de último riego crea el evento de riego', async () => {
    const user = usuario()
    const db = dbDePrueba()
    renderConDb(<FormularioPlanta />, { db, ruta: '/planta/nueva' })

    await user.type(screen.getByLabelText(/nombre/i), 'Monstera del salón')
    await user.type(screen.getByLabelText(/cada cuántos días regar/i), '7')
    fireEvent.change(screen.getByLabelText(/último riego/i), { target: { value: '2026-02-10' } })
    await user.click(screen.getByRole('button', { name: /Guardar planta/i }))

    await waitFor(async () => expect(await db.plants.list()).toHaveLength(1))

    const [planta] = await db.plants.list()
    const eventos = await db.events.listByPlant(planta?.id ?? '')
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.tipo).toBe('riego')
    expect(eventos[0]?.plantId).toBe(planta?.id)
    expect(eventos[0]?.nota).toBe(NOTA_RIEGO)
    expect(toIsoDate(eventos[0]?.fecha ?? '')).toBe('2026-02-10')

    // La planta no guarda ese dato: sale del historial, que es lo que usan los avisos.
    expect(planta).not.toHaveProperty('ultimoRiego')
    expect((await db.events.ultimoRiego(planta?.id ?? ''))?.id).toBe(eventos[0]?.id)
    expect((await db.reminders.estado(planta?.id ?? '')).diasDesdeRiego).toBeGreaterThan(0)
  })

  it('si no se rellena la fecha de último riego no crea ningún evento', async () => {
    const user = usuario()
    const db = dbDePrueba()
    renderConDb(<FormularioPlanta />, { db, ruta: '/planta/nueva' })

    await user.type(screen.getByLabelText(/nombre/i), 'Cactus del rincón')
    await user.click(screen.getByRole('button', { name: /Guardar planta/i }))

    await waitFor(async () => expect(await db.plants.list()).toHaveLength(1))
    expect(await db.events.listRecent()).toHaveLength(0)
    const [planta] = await db.plants.list()
    expect(await db.events.ultimoRiego(planta?.id ?? '')).toBeUndefined()
  })

  it('al editar cambia la fecha del mismo evento en vez de duplicarlo', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Poto del pasillo', frecuenciaRiegoDias: 9 })
    const delFormulario = await db.events.create({
      plantId: planta.id,
      tipo: 'riego',
      fecha: '2026-02-10T12:00:00.000Z',
      nota: NOTA_RIEGO,
    })
    // Un riego que registró el usuario desde la ficha: el formulario no lo toca.
    const delUsuario = await db.events.create({
      plantId: planta.id,
      tipo: 'riego',
      fecha: '2026-01-05T12:00:00.000Z',
      nota: 'Con filtro',
    })

    renderConDb(<FormularioPlanta />, { db, ruta: `/planta/${planta.id}/editar`, patron: '/planta/:id/editar' })

    // El campo enseña el riego que dejó el propio formulario.
    const campo = await screen.findByLabelText(/último riego/i)
    await waitFor(() => expect(campo).toHaveValue('2026-02-10'))

    fireEvent.change(campo, { target: { value: '2026-03-05' } })
    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await waitFor(async () => {
      const riegos = (await db.events.listByPlant(planta.id)).filter((e) => e.tipo === 'riego')
      expect(toIsoDate(riegos.find((e) => e.id === delFormulario.id)?.fecha ?? '')).toBe('2026-03-05')
    })

    const riegos = (await db.events.listByPlant(planta.id)).filter((e) => e.tipo === 'riego')
    // Sigue habiendo los mismos dos riegos: no se ha creado ninguno nuevo.
    expect(riegos).toHaveLength(2)
    expect(toIsoDate(riegos.find((e) => e.id === delFormulario.id)?.fecha ?? '')).toBe('2026-03-05')
    expect(riegos.find((e) => e.id === delFormulario.id)?.creadoEn).toBe(delFormulario.creadoEn)
    expect(toIsoDate(riegos.find((e) => e.id === delUsuario.id)?.fecha ?? '')).toBe('2026-01-05')
    expect((await db.plants.list()).length).toBe(1)
  })

  it('al editar sin tocar la fecha no duplica el evento', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Dracena' })
    await db.events.create({
      plantId: planta.id,
      tipo: 'riego',
      fecha: '2026-02-10T12:00:00.000Z',
      nota: NOTA_RIEGO,
    })

    renderConDb(<FormularioPlanta />, { db, ruta: `/planta/${planta.id}/editar`, patron: '/planta/:id/editar' })
    await waitFor(() => expect(screen.getByLabelText(/último riego/i)).toHaveValue('2026-02-10'))

    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await waitFor(async () => expect((await db.plants.get(planta.id))?.nombre).toBe('Dracena'))
    const riegos = (await db.events.listByPlant(planta.id)).filter((e) => e.tipo === 'riego')
    expect(riegos).toHaveLength(1)
    expect(toIsoDate(riegos[0]?.fecha ?? '')).toBe('2026-02-10')
  })

  it('si se borra la fecha, quita el evento de riego del formulario', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Helecho' })
    await db.events.create({
      plantId: planta.id,
      tipo: 'riego',
      fecha: '2026-02-10T12:00:00.000Z',
      nota: NOTA_RIEGO,
    })

    renderConDb(<FormularioPlanta />, { db, ruta: `/planta/${planta.id}/editar`, patron: '/planta/:id/editar' })
    const campo = await screen.findByLabelText(/último riego/i)
    await waitFor(() => expect(campo).toHaveValue('2026-02-10'))

    fireEvent.change(campo, { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await waitFor(async () => expect(await db.events.listByPlant(planta.id)).toHaveLength(0))
    expect(await db.events.ultimoRiego(planta.id)).toBeUndefined()
  })
})