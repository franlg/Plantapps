import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Inicio } from './Inicio'
import { dbDePrueba, haceDias, renderConDb, usuario } from './entornoPrueba'

describe('<Inicio>', () => {
  it('sin plantas enseña el estado vacío y su botón de añadir', async () => {
    renderConDb(<Inicio />, { db: dbDePrueba(), ruta: '/' })

    expect(await screen.findByText('Todavía no hay plantas')).toBeInTheDocument()
    expect(
      screen.getByText(/apunta cuándo las plantaste/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Añadir primera planta/i })).toBeInTheDocument()
  })

  it('el botón de añadir lleva al alta de planta', async () => {
    const user = usuario()
    renderConDb(<Inicio />, { db: dbDePrueba(), ruta: '/' })

    await user.click(await screen.findByRole('button', { name: /Añadir primera planta/i }))

    expect(await screen.findByText('Otra pantalla')).toBeInTheDocument()
  })

  it('lista todas las plantas con su nombre y su especie', async () => {
    const db = dbDePrueba()
    const monstera = await db.plants.create({ nombre: 'Monstera del salón', especie: 'Monstera deliciosa' })
    const cactus = await db.plants.create({ nombre: 'Cactus del despacho' })
    // Con riego reciente ninguna de las dos necesita atención: así cada nombre
    // sale una sola vez, en su tarjeta de la lista.
    await db.events.create({ plantId: monstera.id, tipo: 'riego', fecha: haceDias(1) })
    await db.events.create({ plantId: cactus.id, tipo: 'riego', fecha: haceDias(1) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    expect(await screen.findByText('Monstera del salón')).toBeInTheDocument()
    expect(screen.getByText('Monstera deliciosa')).toBeInTheDocument()
    expect(screen.getByText('Cactus del despacho')).toBeInTheDocument()
    expect(screen.queryByText('Todavía no hay plantas')).not.toBeInTheDocument()
    expect(screen.queryByText('Requieren atención')).not.toBeInTheDocument()
  })

  it('avisa de las plantas que llevan demasiado sin regar', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    const seccion = await screen.findByRole('region', { name: 'Requieren atención' })
    expect(within(seccion).getByText('Ficus del rincón')).toBeInTheDocument()
    expect(within(seccion).getByText(/sin regar/i)).toBeInTheDocument()
    expect(within(seccion).getByText('Riego vencido')).toBeInTheDocument()
  })

  it('sin plantas vencidas no enseña la sección de atención', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Poto', frecuenciaRiegoDias: 10 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(1) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    expect(await screen.findByText('Poto')).toBeInTheDocument()
    // El chip de riego llega un instante después que la lista: es asíncrono.
    expect(await screen.findByText('Al día')).toBeInTheDocument()
    expect(screen.queryByText('Requieren atención')).not.toBeInTheDocument()
  })

  it('pulsa una planta y abre su ficha', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Helecho del baño' })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(1) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    await user.click(await screen.findByRole('button', { name: /Helecho del baño/i }))

    expect(await screen.findByText('Otra pantalla')).toBeInTheDocument()
  })
})