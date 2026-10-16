import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
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

/**
 * El botón de riego rápido de una planta dentro de un contenedor (la sección de
 * atención o la lista). El componente lo llama así para que un lector de pantalla
 * no se encuentre con varios botones idénticos llamados solo "Regar".
 */
function botonDeRegar(contenedor: HTMLElement, nombre: string): HTMLElement {
  return within(contenedor).getByRole('button', { name: `Registrar que has regado ${nombre}` })
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

  // ---------------------------------------------------------------------------
  // Riego rápido
  // ---------------------------------------------------------------------------

  it('una planta vencida lleva su botón de regar en la tarjeta de atención', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    const seccion = await screen.findByRole('region', { name: /Requieren atención/i })
    const boton = botonDeRegar(seccion, planta.nombre)
    expect(boton).toBeInTheDocument()
    expect(boton).toBeEnabled()
    expect(boton).toHaveTextContent('Regar')
    // Y el nombre de la planta sigue siendo pulsable para abrir su ficha.
    expect(within(seccion).getByRole('button', { name: /^Ficus del rincón/ })).toBeInTheDocument()
    // El botón de regar va **fuera** de la zona pulsable: un botón dentro de un
    // botón no es HTML válido y el clic acabaría en el elemento equivocado.
    expect(document.querySelector('button button')).toBeNull()
  })

  it('pulsar regar guarda el riego con la fecha de hoy en esa planta', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    const seccion = await screen.findByRole('region', { name: /Requieren atención/i })
    await user.click(botonDeRegar(seccion, planta.nombre))

    const riegos = (await db.events.listByPlant(planta.id)).filter((evento) => evento.tipo === 'riego')
    expect(riegos).toHaveLength(2)
    expect(riegos[0]?.fecha.slice(0, 10)).toBe(haceDias(0).slice(0, 10))
  })

  it('mientras se guarda, ese botón muestra el spinner y queda deshabilitado', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

    // El guardado se queda a medias hasta que la prueba lo deja continuar: así se
    // puede mirar el botón en pleno trabajo sin pelearse con los tiempos.
    const guardar = db.events.create.bind(db.events)
    let continuar: () => void = () => undefined
    const espera = new Promise<void>((resolver) => {
      continuar = resolver
    })
    vi.spyOn(db.events, 'create').mockImplementation(async (evento) => {
      await espera
      return guardar(evento)
    })

    renderConDb(<Inicio />, { db, ruta: '/' })

    const seccion = await screen.findByRole('region', { name: /Requieren atención/i })
    await user.click(botonDeRegar(seccion, planta.nombre))

    const enCurso = botonDeRegar(seccion, planta.nombre)
    expect(enCurso).toBeDisabled()
    expect(enCurso).toHaveAttribute('aria-busy', 'true')
    expect(within(enCurso).getByText('Registrando el riego')).toBeInTheDocument()

    await act(async () => {
      continuar()
    })

    // Al terminar, la planta ya no necesita agua y sale de la sección.
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /Requieren atención/i })).not.toBeInTheDocument()
    })
  })

  it('tras regar la planta sale de "Requieren atención" y avisa de que quedó guardado', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    const seccion = await screen.findByRole('region', { name: /Requieren atención/i })
    await user.click(botonDeRegar(seccion, planta.nombre))

    // El refetch automático se lleva la planta: no queda nada que mirar.
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /Requieren atención/i })).not.toBeInTheDocument()
    })
    expect(screen.getByText(/Nada urgente ahora mismo/i)).toBeInTheDocument()

    // En la lista se ve al día, sin recargar, y con el aviso de que se guardó.
    expect(await screen.findByText('Al día')).toBeInTheDocument()
    expect(await screen.findByText('Riego registrado')).toBeInTheDocument()
  })

  it('el aviso de riego registrado se quita solo', async () => {
    // Con reloj falso, porque el aviso dura unos segundos y no se va a esperar a
    // que pasen de verdad. Aquí no se usan `findBy*` ni `waitFor`: con el reloj
    // falso no esperan, así que el tiempo se avanza a mano.
    vi.useFakeTimers()
    try {
      const db = dbDePrueba()
      const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
      await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

      renderConDb(<Inicio />, { db, ruta: '/' })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      fireEvent.click(botonDeRegar(screen.getByRole('region', { name: /Requieren atención/i }), planta.nombre))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText('Riego registrado')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(screen.queryByText('Riego registrado')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('una planta al día no lleva botón de regar', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Poto', frecuenciaRiegoDias: 10 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(1) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    // El chip llega un instante después que la lista: es asíncrono.
    expect(await screen.findByText('Al día')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Registrar que has regado/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Regar')).not.toBeInTheDocument()
  })

  it('una planta nunca regada también puede regarse desde la lista', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Cactus del despacho' })

    renderConDb(<Inicio />, { db, ruta: '/' })

    const lista = await screen.findByRole('region', { name: /Todas tus plantas/i })
    await waitFor(() => {
      expect(botonDeRegar(lista, planta.nombre)).toBeInTheDocument()
    })
    // Y sale en "Requieren atención", que es donde primero se mira.
    const seccion = await screen.findByRole('region', { name: /Requieren atención/i })
    expect(botonDeRegar(seccion, planta.nombre)).toBeInTheDocument()
  })

  it('regar desde inicio no abre la ficha, pero el nombre de la tarjeta sí', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })

    renderConDb(<Inicio />, { db, ruta: '/' })

    const seccion = await screen.findByRole('region', { name: /Requieren atención/i })
    await user.click(botonDeRegar(seccion, planta.nombre))

    // El botón de regar no navega: seguimos en la pantalla de inicio.
    expect(screen.queryByText('Otra pantalla')).not.toBeInTheDocument()

    const lista = await screen.findByRole('region', { name: /Todas tus plantas/i })
    await user.click(within(lista).getByRole('button', { name: /^Ficus del rincón/ }))

    expect(await screen.findByText('Otra pantalla')).toBeInTheDocument()
  })

  it('si el riego no se puede guardar avisa arriba y deja la planta como estaba', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })
    vi.spyOn(db.events, 'create').mockRejectedValue(new Error('no hay espacio en el dispositivo'))

    renderConDb(<Inicio />, { db, ruta: '/' })

    const seccion = await screen.findByRole('region', { name: /Requieren atención/i })
    await user.click(botonDeRegar(seccion, planta.nombre))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/no se ha podido registrar el riego/i)
    expect(alerta).toHaveTextContent(/inténtalo otra vez/i)
    expect(alerta).toHaveTextContent('no hay espacio en el dispositivo')

    // Ni se pierde el riego de antes ni se va la planta: se puede reintentar.
    expect(await db.events.listByPlant(planta.id)).toHaveLength(1)
    await waitFor(() => {
      expect(botonDeRegar(seccion, planta.nombre)).toBeEnabled()
    })
    expect(screen.queryByText('Riego registrado')).not.toBeInTheDocument()
  })

  it('el aviso de error se puede cerrar', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del rincón', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(21) })
    vi.spyOn(db.events, 'create').mockRejectedValue(new Error('no hay espacio en el dispositivo'))

    renderConDb(<Inicio />, { db, ruta: '/' })

    const seccion = await screen.findByRole('region', { name: /Requieren atención/i })
    await user.click(botonDeRegar(seccion, planta.nombre))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: /cerrar/i }))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})