import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Inicio } from './Inicio'
import { dbDePrueba, haceDias, renderConDb, usuario } from './entornoPrueba'

/** Cabecera pulsable de un acordeón: es el `<button>` que lleva `aria-expanded`. */
function cabecera(titulo: RegExp): HTMLElement {
  return screen.getByRole('button', { name: titulo })
}

/**
 * El panel plegable de un acordeón. Se busca por id porque `getByRole` no ve
 * lo que está oculto: un panel plegado no sale, y hay que poder mirarlo igual.
 */
function panelDe(cabecera: HTMLElement): HTMLElement {
  const panel = document.getElementById(cabecera.getAttribute('aria-controls') ?? '')
  if (!panel) throw new Error('El acordeón no tiene panel')
  return panel
}

/** Espera a que la cabecera exista: los datos llegan de la base de datos, no de golpe. */
async function waitForCabecera(titulo: RegExp): Promise<HTMLElement> {
  return screen.findByRole('button', { name: titulo })
}

describe('<Inicio>', () => {
  beforeEach(() => {
    // El plegado se recuerda en `localStorage`: cada prueba empieza de cero.
    window.localStorage.clear()
  })

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
    // Sin atención, la sección sale pero plegada: no molesta mientras no haya nada que mirar.
    expect(cabecera(/Requieren atención/i)).toHaveAttribute('aria-expanded', 'false')
  })

  it('avisa de las plantas que llevan demasiado sin regar', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    const seccion = await screen.findByRole('region', { name: /Requieren atención/i })
    expect(within(seccion).getByText('Ficus del rincón')).toBeInTheDocument()
    expect(within(seccion).getByText(/sin regar/i)).toBeInTheDocument()
    expect(within(seccion).getByText('Riego vencido')).toBeInTheDocument()
  })

  it('sin plantas vencidas la sección de atención sale plegada y sin contador', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Poto', frecuenciaRiegoDias: 10 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(1) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    expect(await screen.findByText('Poto')).toBeInTheDocument()
    // El chip de riego llega un instante después que la lista: es asíncrono.
    expect(await screen.findByText('Al día')).toBeInTheDocument()

    const seccion = cabecera(/Requieren atención/i)
    expect(seccion).toHaveAttribute('aria-expanded', 'false')
    // Con 0 no se pinta un "0": la pastilla solo aparece cuando hay algo que contar.
    expect(seccion).not.toHaveTextContent('0')
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

  // ---------------------------------------------------------------------------
  // Acordeones
  // ---------------------------------------------------------------------------

  it('con plantas y sin atención la de atención va plegada y la de plantas desplegada', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Poto', frecuenciaRiegoDias: 10 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(1) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    const atencion = await waitForCabecera(/Requieren atención/i)
    const plantas = cabecera(/Todas tus plantas/i)

    expect(atencion).toHaveAttribute('aria-expanded', 'false')
    expect(plantas).toHaveAttribute('aria-expanded', 'true')
    // Lo plegado no se ve: la lista de plantas empuja hacia abajo y nada más.
    expect(screen.getByText('Poto')).toBeVisible()
    expect(screen.queryByRole('region', { name: /Requieren atención/i })).not.toBeInTheDocument()
  })

  it('con atención la sección se despliega sola y enseña los motivos', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    await waitForCabecera(/Requieren atención/i)
    expect(cabecera(/Requieren atención/i)).toHaveAttribute('aria-expanded', 'true')
    // El motivo sale en la sección de atención, no solo en el chip de la tarjeta.
    expect(within(panelDe(cabecera(/Requieren atención/i))).getByText('Riego vencido')).toBeVisible()
  })

  it('sin plantas no pinta ningún acordeón, solo el estado vacío', async () => {
    renderConDb(<Inicio />, { db: dbDePrueba(), ruta: '/' })

    expect(await screen.findByText('Todavía no hay plantas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Requieren atención/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Todas tus plantas/i })).not.toBeInTheDocument()
  })

  it('el contador enseña el número de cada sección', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    await waitForCabecera(/Requieren atención/i)
    expect(within(cabecera(/Requieren atención/i)).getByText('1')).toBeInTheDocument()
    expect(within(cabecera(/Todas tus plantas/i)).getByText('1')).toBeInTheDocument()
  })

  it('pulsar la cabecera pliega y vuelve a desplegar la sección', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Poto', frecuenciaRiegoDias: 10 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(1) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    await screen.findByText('Poto')
    const seccion = cabecera(/Todas tus plantas/i)
    expect(seccion).toHaveAttribute('aria-expanded', 'true')

    await user.click(seccion)

    expect(seccion).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Poto')).not.toBeVisible()

    await user.click(seccion)

    expect(seccion).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Poto')).toBeVisible()
  })

  it('la sección de atención se puede plegar a mano aunque tenga cosas', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    await waitForCabecera(/Requieren atención/i)
    await user.click(cabecera(/Requieren atención/i))

    expect(cabecera(/Requieren atención/i)).toHaveAttribute('aria-expanded', 'false')
    expect(within(panelDe(cabecera(/Requieren atención/i))).getByText('Riego vencido')).not.toBeVisible()
    // Plegada y en ámbar: el contador sigue a la vista para que no se pase nada.
    expect(within(cabecera(/Requieren atención/i)).getByText('1')).toBeInTheDocument()
  })

  it('recuerda en localStorage cómo dejó el usuario las secciones', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Poto', frecuenciaRiegoDias: 10 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(1) })

    const primera = renderConDb(<Inicio />, { db, ruta: '/' })
    await screen.findByText('Poto')

    // Al abrir la app no se guarda nada: los valores por defecto siguen mandando.
    expect(window.localStorage.getItem('inicio-acordeon')).toBeNull()

    await user.click(cabecera(/Todas tus plantas/i))

    expect(window.localStorage.getItem('inicio-acordeon')).toContain('"plantas":false')

    primera.unmount()
    renderConDb(<Inicio />, { db, ruta: '/' })

    await screen.findByText('Poto')
    expect(cabecera(/Todas tus plantas/i)).toHaveAttribute('aria-expanded', 'false')
    expect(cabecera(/Requieren atención/i)).toHaveAttribute('aria-expanded', 'false')
  })

  it('una sección plegada a mano manda sobre el valor por defecto al volver', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

    const primera = renderConDb(<Inicio />, { db, ruta: '/' })
    await waitForCabecera(/Requieren atención/i)

    await user.click(cabecera(/Requieren atención/i))
    expect(cabecera(/Requieren atención/i)).toHaveAttribute('aria-expanded', 'false')

    primera.unmount()
    renderConDb(<Inicio />, { db, ruta: '/' })

    await waitForCabecera(/Requieren atención/i)
    expect(cabecera(/Requieren atención/i)).toHaveAttribute('aria-expanded', 'false')
  })
})