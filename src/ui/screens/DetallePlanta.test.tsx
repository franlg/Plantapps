import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import type { AiAnalysisDraft } from '@/types'
import type { Db } from '@/services/contracts'

// La IA y la cámara se simulan: aquí no hay red ni archivos reales.
vi.mock('@/services/ai', () => ({
  aiService: { isConfigured: () => true, analyze: vi.fn() },
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

const PATRON = '/planta/:id'

beforeEach(() => {
  vi.mocked(aiService.analyze).mockReset()
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
})