import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import type { AiAnalysisDraft, GuiaCuidadosDraft, IdentificacionDraft } from '@/types'
import type { Db } from '@/services/contracts'

// La IA y la cámara se simulan: aquí no hay red ni archivos reales.
vi.mock('@/services/ai', () => ({
  aiService: {
    isConfigured: () => true,
    analyze: vi.fn(),
    generarGuia: vi.fn(),
    identificar: vi.fn(),
  },
}))

vi.mock('@/services/photos', () => ({
  pickPhoto: vi.fn(async () => new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' })),
  guardarFoto: vi.fn(async (db: Db) => db.photos.put(new Blob(['foto'], { type: 'image/jpeg' }))),
}))

const { aiService } = await import('@/services/ai')
const { DetallePlanta } = await import('./DetallePlanta')
const { dbDePrueba, espiarObjectURL, haceDias, renderConDb, usuario } = await import('./entornoPrueba')
const { AiError, EVENTO_LABELS, VEREDICTO_LABELS } = await import('@/types')

const BORRADOR: AiAnalysisDraft = {
  veredicto: 'regar',
  salud: 55,
  accionPrincipal: 'Riega en profundidad esta semana',
  regar: true,
  frecuenciaRiegoDias: 8,
  problema: 'Hojas amarillas en la base',
  gravedad: 'leve',
  sintomas: ['hojas amarillas', 'tierra seca'],
  recomendaciones: ['Riega hasta que salga agua por debajo', 'Quita las hojas secas'],
  confianza: 'baja',
  resumen: 'La planta tiene sed. No es grave, pero conviene regarla ya.',
}

/** Guía de cuidados de ejemplo: seis apartados en la app, aquí solo dos. */
const BORRADOR_GUIA: GuiaCuidadosDraft = {
  nombreComun: 'Monstera',
  nombreCientifico: 'Monstera deliciosa',
  familia: 'Araceae',
  resumen: 'Aguanta bastante la falta de agua y crece rápido con luz indirecta.',
  secciones: [
    {
      titulo: 'Riego',
      contenido: 'Déjala secar casi del todo entre riegos.',
      puntos: ['Comprueba la tierra con el dedo antes de regar'],
    },
    { titulo: 'Luz', contenido: 'Le va bien cerca de una ventana sin sol directo.' },
  ],
  frecuenciaRiegoDias: 10,
  dificultad: 'facil',
  basadaEnContexto: true,
}

/** El modelo se equivoca con la frecuencia a propósito: la tabla dice 10 días. */
const IDENTIFICACION: IdentificacionDraft = {
  especie: 'Monstera deliciosa',
  nombreComun: 'Monstera',
  familia: 'Araceae',
  confianza: 'alta',
  razon: 'Hojas grandes con lóbulos y nervaduras marcadas.',
  alternativas: ['Philodendron gloriosum'],
  frecuenciaRiegoDias: 7,
  luz: 'sol_indirecto',
}

/** Respuesta honesta del modelo cuando la foto no deja decidir. */
const SIN_RECONOCER: IdentificacionDraft = {
  especie: null,
  nombreComun: null,
  familia: null,
  confianza: 'baja',
  razon: 'La foto es demasiado oscura y solo se ven hojas.',
  alternativas: [],
  frecuenciaRiegoDias: null,
  luz: null,
}

const PATRON = '/planta/:id'

beforeEach(() => {
  vi.mocked(aiService.analyze).mockReset()
  vi.mocked(aiService.generarGuia).mockReset()
  vi.mocked(aiService.identificar).mockReset()
})

describe('<DetallePlanta>', () => {
  it('enseña el historial con el nombre de cada tipo de evento', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Helecho del baño', especie: 'Nephrolepis' })
    await db.events.create({
      plantId: planta.id,
      tipo: 'riego',
      fecha: haceDias(12),
      nota: 'Riego corto',
      cantidad: '200 ml',
    })
    await db.events.create({
      plantId: planta.id,
      tipo: 'comentario',
      fecha: haceDias(3),
      nota: 'Han salido hojas nuevas',
    })

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    expect(await screen.findByText(EVENTO_LABELS.riego)).toBeInTheDocument()
    expect(screen.getByText(EVENTO_LABELS.comentario)).toBeInTheDocument()
    expect(screen.getByText('Riego corto')).toBeInTheDocument()
    expect(screen.getByText('200 ml')).toBeInTheDocument()
    expect(screen.getByText('Han salido hojas nuevas')).toBeInTheDocument()
  })

  it('enseña el estado de riego con los días que faltan', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus', frecuenciaRiegoDias: 10 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(12) })

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    expect(await screen.findByText(/Riego vencido/i)).toBeInTheDocument()
  })

  it('sin clave de IA explica dónde conseguirla en vez de analizar', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Poto del pasillo' })

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    await user.click(await screen.findByRole('button', { name: /Analizar con IA/i }))

    expect(screen.getByText(/Añade tu clave gratuita en Ajustes para usar la IA/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ir a Ajustes/i })).toHaveAttribute('href', '/ajustes')
    // Sin clave no se ofrece ni la cámara ni el botón de analizar.
    expect(screen.queryByRole('button', { name: /^Analizar$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Hacer foto/i })).not.toBeInTheDocument()
  })

  it('registra un riego y lo añade al historial', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Cactus del despacho', frecuenciaRiegoDias: 25 })

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    await user.click(await screen.findByRole('button', { name: /Registrar riego/i }))

    await waitFor(async () => expect(await db.events.listByPlant(planta.id)).toHaveLength(1))
    expect(await screen.findByText(EVENTO_LABELS.riego)).toBeInTheDocument()
    expect(screen.getByText(/guardado en el historial/i)).toBeInTheDocument()
  })

  it('pregunta antes de borrar un evento del historial', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Bambú' })
    await db.events.create({ plantId: planta.id, tipo: 'poda', fecha: haceDias(2), nota: 'Poda de色列os' })

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    await user.click(await screen.findByRole('button', { name: /Borrar el evento Poda/i }))
    await user.click(await screen.findByRole('button', { name: /Sí, borrar/i }))

    await waitFor(async () => expect(await db.events.listByPlant(planta.id)).toHaveLength(0))
  })

  it('archivar la planta la quita de la lista pero conserva el historial', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Lavanda' })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(2) })

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    await user.click(await screen.findByRole('button', { name: /Archivar planta/i }))
    await user.click(await screen.findByRole('button', { name: /Sí, archivar/i }))

    await waitFor(async () => expect(await db.plants.list()).toHaveLength(0))
    expect(await db.events.listByPlant(planta.id)).toHaveLength(1)
    expect(await screen.findByText('Otra pantalla')).toBeInTheDocument()
  })

  it('analiza la foto, guarda el resultado y lo deja en el historial', async () => {
    const user = usuario()
    vi.mocked(aiService.analyze).mockResolvedValue(BORRADOR)
    const espia = espiarObjectURL()

    try {
      const db = dbDePrueba()
      await db.settings.save({ apiKey: 'AIza-de-prueba' })
      const planta = await db.plants.create({ nombre: 'Poto del pasillo', frecuenciaRiegoDias: 9 })
      await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(3) })

      renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

      await user.click(await screen.findByRole('button', { name: /Analizar con IA/i }))
      await user.click(screen.getByRole('button', { name: /Hacer foto/i }))
      await user.click(await screen.findByRole('button', { name: /^Analizar$/i }))

      // Se le manda la foto y el contexto de la planta, no solo la imagen.
      await waitFor(() => expect(aiService.analyze).toHaveBeenCalledTimes(1))
      const enviado = vi.mocked(aiService.analyze).mock.calls[0]?.[0]
      expect(enviado?.plantId).toBe(planta.id)
      expect(enviado?.contexto.nombre).toBe('Poto del pasillo')
      expect(enviado?.contexto.historial[0]).toMatch(/hace 3 días: Riego/)

      // El resultado se pinta entero (también sale resumido en el historial).
      expect((await screen.findAllByText(VEREDICTO_LABELS.regar)).length).toBeGreaterThan(0)
      expect((await screen.findAllByText(BORRADOR.accionPrincipal)).length).toBeGreaterThan(0)
      expect((await screen.findAllByText(BORRADOR.resumen)).length).toBeGreaterThan(0)
      expect(screen.getByText(/cada 8 días/i)).toBeInTheDocument()
      expect(screen.getByText(BORRADOR.sintomas[0])).toBeInTheDocument()
      expect(screen.getByText(BORRADOR.recomendaciones[0])).toBeInTheDocument()
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '55')
      // Con confianza baja se avisa de que la foto puede no estar clara.
      expect(screen.getByText(/Fídate poco/i)).toBeInTheDocument()

      // Y queda guardado: análisis + evento en el historial.
      expect(await db.analyses.listByPlant(planta.id)).toHaveLength(1)
      const eventos = await db.events.listByPlant(planta.id)
      expect(eventos.filter((evento) => evento.tipo === 'analisis')).toHaveLength(1)
      // Sin foto previa, la foto analizada pasa a ser la portada.
      expect((await db.plants.get(planta.id))?.fotoPortadaId).toBeTruthy()

      // El botón del resultado también registra el riego.
      const registrar = (await screen.findAllByRole('button', { name: /Registrar riego/i }))[1]
      await user.click(registrar!)
      await waitFor(async () =>
        expect((await db.events.listByPlant(planta.id)).filter((e) => e.tipo === 'riego')).toHaveLength(2),
      )
    } finally {
      espia.restore()
    }
  })

  it('traduce un fallo de la cuota y ofrece reintentar', async () => {
    const user = usuario()
    vi.mocked(aiService.analyze).mockRejectedValue(new AiError('agotado', 'cuota'))
    const espia = espiarObjectURL()

    try {
      const db = dbDePrueba()
      await db.settings.save({ apiKey: 'AIza-de-prueba' })
      const planta = await db.plants.create({ nombre: 'Poto del pasillo' })

      renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

      await user.click(await screen.findByRole('button', { name: /Analizar con IA/i }))
      await user.click(screen.getByRole('button', { name: /Hacer foto/i }))
      await user.click(await screen.findByRole('button', { name: /^Analizar$/i }))

      expect(await screen.findByText('Sin consultas por hoy')).toBeInTheDocument()
      expect(screen.getByText(/has usado todas las consultas gratuitas de hoy/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
      expect(await db.analyses.listByPlant(planta.id)).toHaveLength(0)
    } finally {
      espia.restore()
    }
  })

  // -------------------------------------------------------------------------
  // Guía de cuidados
  // -------------------------------------------------------------------------

  it('ofrece escribir la guía si la planta todavía no tiene ninguna', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Helecho del baño' })

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    expect(await screen.findByRole('heading', { name: /Guía de cuidados/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pedir guía de cuidados/i })).toBeInTheDocument()
  })

  it('sin clave de IA manda a Ajustes en vez de escribir la guía', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Helecho del baño' })

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    await user.click(await screen.findByRole('button', { name: /Pedir guía de cuidados/i }))

    expect(await screen.findByText('Falta la clave de la IA')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ir a Ajustes/i })).toHaveAttribute('href', '/ajustes')
    expect(aiService.generarGuia).not.toHaveBeenCalled()
    expect(await db.guides.get(planta.id)).toBeUndefined()
  })

  it('escribe la guía con los datos de la planta y la guarda, sin tocar el historial', async () => {
    const user = usuario()
    vi.mocked(aiService.generarGuia).mockResolvedValue(BORRADOR_GUIA)

    const db = dbDePrueba()
    await db.settings.save({ apiKey: 'AIza-de-prueba' })
    const planta = await db.plants.create({
      nombre: 'Poto del pasillo',
      especie: 'Epipremnum aureum',
      maceta: '18 cm',
      ubicacion: 'salón, junto a la ventana',
      luz: 'sol_indirecto',
    })
    const riego = haceDias(4)
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: riego })
    // Con foto de portada, la guía se afina a esa planta concreta.
    const portada = await db.photos.put(new Blob(['portada'], { type: 'image/jpeg' }))
    await db.plants.setFotoPortada(planta.id, portada.id)

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    await user.click(await screen.findByRole('button', { name: /Pedir guía de cuidados/i }))

    await waitFor(() => expect(aiService.generarGuia).toHaveBeenCalledTimes(1))
    const enviado = vi.mocked(aiService.generarGuia).mock.calls[0]?.[0]
    expect(enviado?.plantId).toBe(planta.id)
    expect(enviado?.foto).toBeInstanceOf(Blob)
    expect(enviado?.contexto.nombre).toBe('Poto del pasillo')
    expect(enviado?.contexto.especie).toBe('Epipremnum aureum')
    expect(enviado?.contexto.maceta).toBe('18 cm')
    expect(enviado?.contexto.ubicacion).toBe('salón, junto a la ventana')
    expect(enviado?.contexto.luz).toBe('Sol indirecto')
    expect(enviado?.contexto.ultimoRiego).toBe(riego)

    await waitFor(async () => expect(await db.guides.get(planta.id)).toBeTruthy())
    const guardada = await db.guides.get(planta.id)
    expect(guardada?.secciones[0]?.titulo).toBe('Riego')
    expect(guardada?.dificultad).toBe('facil')

    // La guía es un texto de consulta: no es un análisis del estado de la planta.
    expect(await db.events.listByPlant(planta.id)).toHaveLength(1)
    expect(await screen.findByRole('heading', { name: 'Riego' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pedir guía de cuidados/i })).not.toBeInTheDocument()
  })

  it('muestra la guía guardada con sus secciones y la fecha en que se escribió', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Monstera del salón' })
    await db.guides.create({ ...BORRADOR_GUIA, plantId: planta.id, modelo: 'gemini-3.6-flash' })

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    expect(await screen.findByText(BORRADOR_GUIA.nombreComun)).toBeInTheDocument()
    expect(screen.getByText(/Monstera deliciosa · Araceae/)).toBeInTheDocument()
    expect(screen.getByText('Dificultad: Fácil')).toBeInTheDocument()
    expect(screen.getByText(/^Generada el /)).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Riego' })).toBeInTheDocument()
    expect(screen.getByText(BORRADOR_GUIA.secciones[0].contenido)).toBeInTheDocument()
    expect(screen.getByText(BORRADOR_GUIA.secciones[0].puntos?.[0] ?? '')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Luz' })).toBeInTheDocument()
    expect(screen.getByText(BORRADOR_GUIA.secciones[1].contenido)).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /Regenerar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Borrar la guía/i })).toBeInTheDocument()
  })

  it('avisa si la guía es vieja y puede estar desactualizada', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Ficus del despacho' })

    // La guía se firma con la hora de ahora, así que se fabrica hace 200 días.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(Date.now() - 200 * 86_400_000))
      await db.guides.create({ ...BORRADOR_GUIA, plantId: planta.id, modelo: 'gemini-3.6-flash' })
    } finally {
      vi.useRealTimers()
    }

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    expect(await screen.findByText(/puede estar desactualizada/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Regenerar/i })).toBeInTheDocument()
  })

  it('pregunta antes de regenerar y antes de borrar la guía', async () => {
    const user = usuario()
    vi.mocked(aiService.generarGuia).mockResolvedValue(BORRADOR_GUIA)

    const db = dbDePrueba()
    await db.settings.save({ apiKey: 'AIza-de-prueba' })
    const planta = await db.plants.create({ nombre: 'Monstera del salón' })
    await db.guides.create({ ...BORRADOR_GUIA, plantId: planta.id, modelo: 'gemini-3.6-flash' })

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    // Regenerar deja la anterior en el aire hasta que se confirma.
    await user.click(await screen.findByRole('button', { name: /Regenerar/i }))
    expect(await screen.findByRole('button', { name: /Sí, escribirla/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(aiService.generarGuia).not.toHaveBeenCalled()

    // Borrar sí se lleva la guía.
    await user.click(screen.getByRole('button', { name: /Borrar la guía/i }))
    await user.click(await screen.findByRole('button', { name: 'Sí, borrar' }))
    await waitFor(async () => expect(await db.guides.get(planta.id)).toBeUndefined())
    expect(await screen.findByRole('button', { name: /Pedir guía de cuidados/i })).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // ¿Qué planta es?
  // -------------------------------------------------------------------------

  it('si no puede reconocerla lo dice y no rellena nada', async () => {
    const user = usuario()
    vi.mocked(aiService.identificar).mockResolvedValue(SIN_RECONOCER)
    const espia = espiarObjectURL()

    try {
      const db = dbDePrueba()
      await db.settings.save({ apiKey: 'AIza-de-prueba' })
      const planta = await db.plants.create({ nombre: 'La del rincón' })

      renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

      await user.click(await screen.findByRole('button', { name: /¿Qué planta es\?/i }))
      await user.click(await screen.findByRole('radio', { name: 'Cámara' }))
      await user.click(await screen.findByRole('button', { name: /^Identificar$/i }))

      expect(await screen.findByText('No he podido reconocerla')).toBeInTheDocument()
      expect(screen.getByText(SIN_RECONOCER.razon)).toBeInTheDocument()
      expect(screen.getByText(/Fídate poco/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Repetir con otra foto/i })).toBeInTheDocument()

      // Sin especie no se ofrece rellenar nada, y la ficha sigue como estaba.
      expect(screen.queryByRole('button', { name: /Rellenar los datos/i })).not.toBeInTheDocument()
      const guardada = await db.plants.get(planta.id)
      expect(guardada?.especie).toBeUndefined()
      expect(guardada?.frecuenciaRiegoDias).toBeUndefined()
    } finally {
      espia.restore()
    }
  })

  it('rellena la ficha con especie, riego y luz de una sola vez', async () => {
    const user = usuario()
    vi.mocked(aiService.identificar).mockResolvedValue(IDENTIFICACION)
    const espia = espiarObjectURL()

    try {
      const db = dbDePrueba()
      await db.settings.save({ apiKey: 'AIza-de-prueba' })
      const planta = await db.plants.create({ nombre: 'La del rincón', maceta: '20 cm' })

      renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

      await user.click(await screen.findByRole('button', { name: /¿Qué planta es\?/i }))
      await user.click(await screen.findByRole('radio', { name: 'Galería' }))
      await user.click(await screen.findByRole('button', { name: /^Identificar$/i }))

      // El modelo responde y se ve el por qué, la confianza y las alternativas.
      expect(await screen.findByText('Monstera deliciosa')).toBeInTheDocument()
      expect(screen.getByText(IDENTIFICACION.razon)).toBeInTheDocument()
      expect(screen.getByText('Confianza: alta')).toBeInTheDocument()
      expect(screen.getByText(IDENTIFICACION.alternativas[0])).toBeInTheDocument()
      // Lo que dice el modelo y lo que dice la tabla de la app, sin ocultar ninguno.
      expect(screen.getByText(/La tabla de la app sugiere regarla cada 10 días/i)).toBeInTheDocument()

      await user.click(await screen.findByRole('button', { name: /Rellenar los datos/i }))

      const aviso = await screen.findByText(/se va a guardar/i)
      expect(aviso).toHaveTextContent('especie: Monstera deliciosa')
      expect(aviso).toHaveTextContent('riego cada 7 días')
      expect(aviso).toHaveTextContent('luz: sol indirecto')

      await user.click(screen.getByRole('button', { name: /Sí, rellenar/i }))

      await waitFor(async () => {
        const actualizada = await db.plants.get(planta.id)
        expect(actualizada?.especie).toBe('Monstera deliciosa')
        expect(actualizada?.frecuenciaRiegoDias).toBe(7)
        expect(actualizada?.luz).toBe('sol_indirecto')
      })
      // Lo que no se rellena, se queda como estaba.
      expect((await db.plants.get(planta.id))?.maceta).toBe('20 cm')
    } finally {
      espia.restore()
    }
  })

  it('deja elegir la frecuencia de la tabla de la app en vez de la del modelo', async () => {
    const user = usuario()
    vi.mocked(aiService.identificar).mockResolvedValue(IDENTIFICACION)
    const espia = espiarObjectURL()

    try {
      const db = dbDePrueba()
      await db.settings.save({ apiKey: 'AIza-de-prueba' })
      const planta = await db.plants.create({ nombre: 'La del rincón' })

      renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

      await user.click(await screen.findByRole('button', { name: /¿Qué planta es\?/i }))
      await user.click(await screen.findByRole('radio', { name: 'Cámara' }))
      await user.click(await screen.findByRole('button', { name: /^Identificar$/i }))

      await user.click(await screen.findByRole('button', { name: /Usar los 10 días de la tabla/i }))

      const aviso = await screen.findByText(/se va a guardar/i)
      expect(aviso).toHaveTextContent('riego cada 10 días')

      await user.click(screen.getByRole('button', { name: /Sí, rellenar/i }))

      await waitFor(async () =>
        expect((await db.plants.get(planta.id))?.frecuenciaRiegoDias).toBe(10),
      )
    } finally {
      espia.restore()
    }
  })

  it('traduce un fallo al identificar y deja reintentar con otra foto', async () => {
    const user = usuario()
    vi.mocked(aiService.identificar).mockRejectedValue(new AiError('agotado', 'cuota'))
    const espia = espiarObjectURL()

    try {
      const db = dbDePrueba()
      await db.settings.save({ apiKey: 'AIza-de-prueba' })
      const planta = await db.plants.create({ nombre: 'La del rincón' })

      renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

      await user.click(await screen.findByRole('button', { name: /¿Qué planta es\?/i }))
      await user.click(await screen.findByRole('radio', { name: 'Cámara' }))
      await user.click(await screen.findByRole('button', { name: /^Identificar$/i }))

      expect(await screen.findByText('Sin consultas por hoy')).toBeInTheDocument()
      // La foto sigue ahí: se puede volver a intentarlo sin repetirla.
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Reintentar' }))
      await waitFor(() => expect(aiService.identificar).toHaveBeenCalledTimes(2))
    } finally {
      espia.restore()
    }
  })

  it('sin clave de IA no se identifica: explica dónde conseguirla', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'La del rincón' })

    renderConDb(<DetallePlanta />, { db, ruta: `/planta/${planta.id}`, patron: PATRON })

    await user.click(await screen.findByRole('button', { name: /¿Qué planta es\?/i }))

    expect(screen.getByText(/Identificar plantas también usa la IA/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ir a Ajustes/i })).toHaveAttribute('href', '/ajustes')
    expect(screen.queryByRole('radio', { name: 'Cámara' })).not.toBeInTheDocument()
  })
})