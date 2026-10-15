import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, PlantContext } from '@/types'
import { AiError } from '@/types'

/**
 * `db` está mockeado: estos tests no tocan IndexedDB ni la red real.
 * `fetch` se sustituye por un doble que responde como Gemini.
 */
const { mockSettingsGet } = vi.hoisted(() => ({
  mockSettingsGet: vi.fn<() => Promise<AppSettings>>(),
}))

vi.mock('@/db', () => ({
  db: {
    settings: { get: mockSettingsGet, save: vi.fn() },
    subscribe: vi.fn(() => () => undefined),
    notify: vi.fn(),
    get version() {
      return 0
    },
  },
}))

const fetchMock = vi.fn()

const AJUSTES: AppSettings = {
  apiKey: 'clave-de-prueba',
  modelo: 'modelo-principal',
  modeloFallback: 'modelo-respaldo',
  recordatorios: { activos: false, hora: '09:00', diasAnticipacion: 0 },
}

const CONTEXTO: PlantContext = {
  nombre: 'Monstera del salón',
  especie: 'Monstera deliciosa',
  diasDesdePlantado: 120,
  maceta: 'maceta de 18 cm',
  ubicacion: 'sala, junto a la ventana',
  luz: 'sol_indirecto',
  ultimoRiego: new Date('2026-10-01T10:00:00.000Z').toISOString(),
  diasDesdeUltimoRiego: 13,
  frecuenciaRiegoDias: 7,
  historial: ['13 oct 2026 · Riego registrado'],
}

const FOTO = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })

const ANALISIS = {
  veredicto: 'regar',
  salud: 72,
  accionPrincipal: 'Riega en profundidad esta semana',
  regar: true,
  frecuenciaRiegoDias: 8,
  problema: 'Ninguno',
  gravedad: 'ninguna',
  sintomas: ['tierra seca'],
  recomendaciones: ['Riega hasta que drene'],
  confianza: 'media',
  resumen: 'La planta tiene algo de sed pero está bien.',
}

const ENTRADA = { plantId: 'p1', foto: FOTO, contexto: CONTEXTO }

function respuesta(status: number, cuerpo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
  } as Response
}

function exito(texto: string): Response {
  return respuesta(200, { candidates: [{ content: { parts: [{ text: texto }] } }] })
}

function fallo(status: number, mensaje: string): Response {
  return respuesta(status, { error: { code: status, message: mensaje } })
}

/**
 * `vi.resetModules()` carga una copia nueva de `@/types`, así que `AiError` también
 * se reimporta: si no, los `instanceof` de este test comparan clases distintas.
 */
let AiErrorDeEsteModulo = AiError

/** Importa el servicio con la caché de ajustes limpia. */
async function cargarServicio() {
  vi.resetModules()
  const modulo = await import('./index')
  AiErrorDeEsteModulo = (await import('@/types')).AiError
  return modulo
}

function urlsDeLasPeticiones(): string[] {
  return fetchMock.mock.calls.map(([url]) => url as string)
}

async function expectAiError(promesa: Promise<unknown>, codigo: string): Promise<AiError> {
  let error: unknown
  try {
    await promesa
  } catch (e) {
    error = e
  }
  expect(error).toBeInstanceOf(AiErrorDeEsteModulo)
  expect((error as InstanceType<typeof AiErrorDeEsteModulo>).codigo).toBe(codigo)
  return error as InstanceType<typeof AiErrorDeEsteModulo>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSettingsGet.mockReset()
  mockSettingsGet.mockResolvedValue(AJUSTES)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('aiService.analyze', () => {
  it('devuelve el draft validado de una respuesta correcta', async () => {
    fetchMock.mockResolvedValue(exito(JSON.stringify(ANALISIS)))
    const { aiService } = await cargarServicio()

    const draft = await aiService.analyze(ENTRADA)

    expect(draft.veredicto).toBe('regar')
    expect(draft.salud).toBe(72)
    expect(draft.accionPrincipal).toBe('Riega en profundidad esta semana')
    expect(draft.regar).toBe(true)
    expect(draft.frecuenciaRiegoDias).toBe(8)
    expect(draft.confianza).toBe('media')
    expect(draft.sintomas).toEqual(['tierra seca'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlsDeLasPeticiones()[0]).toContain('models/modelo-principal:generateContent')
  })

  it('acepta el JSON envuelto en ```json', async () => {
    fetchMock.mockResolvedValue(exito('```json\n' + JSON.stringify(ANALISIS) + '\n```'))
    const { aiService } = await cargarServicio()

    const draft = await aiService.analyze(ENTRADA)
    expect(draft.resumen).toBe(ANALISIS.resumen)
  })

  it('falla con respuesta_invalida si el modelo no devuelve un análisis válido', async () => {
    fetchMock.mockResolvedValue(exito('{"veredicto":"regar_ya","salud":72}'))
    const { aiService } = await cargarServicio()

    await expectAiError(aiService.analyze(ENTRADA), 'respuesta_invalida')
  })

  it('falla con cuota si se agota el nivel gratuito', async () => {
    fetchMock.mockResolvedValue(fallo(429, 'Quota exceeded'))
    const { aiService } = await cargarServicio()

    await expectAiError(aiService.analyze(ENTRADA), 'cuota')
  })

  it('falla con sin_red si no hay conexión', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { aiService } = await cargarServicio()

    await expectAiError(aiService.analyze(ENTRADA), 'sin_red')
  })

  it('falla con sin_clave si no hay clave en Ajustes, sin llamar a la red', async () => {
    mockSettingsGet.mockResolvedValue({ modelo: 'modelo-principal', modeloFallback: 'modelo-respaldo', recordatorios: AJUSTES.recordatorios })
    const { aiService } = await cargarServicio()

    const error = await expectAiError(aiService.analyze(ENTRADA), 'sin_clave')

    expect(error.message).toBe('Falta la clave de la API. Añádela en Ajustes.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reintenta UNA vez con el modelo de respaldo si el principal no existe', async () => {
    fetchMock
      .mockResolvedValueOnce(fallo(404, 'models/modelo-principal is not found for API version v1beta'))
      .mockResolvedValueOnce(exito(JSON.stringify(ANALISIS)))

    const { aiService } = await cargarServicio()
    const draft = await aiService.analyze(ENTRADA)

    expect(draft.veredicto).toBe('regar')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const urls = urlsDeLasPeticiones()
    expect(urls[0]).toContain('models/modelo-principal:generateContent')
    expect(urls[1]).toContain('models/modelo-respaldo:generateContent')
  })

  it('también reintenta con el respaldo si el principal se queda sin cuota', async () => {
    fetchMock.mockResolvedValueOnce(fallo(429, 'Quota exceeded')).mockResolvedValueOnce(exito(JSON.stringify(ANALISIS)))

    const { aiService } = await cargarServicio()
    expect((await aiService.analyze(ENTRADA)).salud).toBe(72)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reintenta con el respaldo si el principal está saturado (503 high demand)', async () => {
    // Caso real del 14/10/2026 con el nivel gratuito.
    fetchMock
      .mockResolvedValueOnce(fallo(503, 'This model is currently experiencing high demand.'))
      .mockResolvedValueOnce(exito(JSON.stringify(ANALISIS)))

    const { aiService } = await cargarServicio()
    expect((await aiService.analyze(ENTRADA)).salud).toBe(72)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(urlsDeLasPeticiones()[1]).toContain('models/modelo-respaldo:generateContent')
  })

  it('usa el modelo que pide la entrada y no hace falta el respaldo si funciona', async () => {
    fetchMock.mockResolvedValue(exito(JSON.stringify(ANALISIS)))
    const { aiService } = await cargarServicio()

    await aiService.analyze({ ...ENTRADA, modelo: 'otro-modelo' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlsDeLasPeticiones()[0]).toContain('models/otro-modelo:generateContent')
  })

  it('nunca hace más de 2 peticiones aunque los dos modelos fallen', async () => {
    fetchMock.mockResolvedValue(fallo(429, 'Quota exceeded'))
    const { aiService } = await cargarServicio()

    await expectAiError(aiService.analyze(ENTRADA), 'cuota')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('no reintenta si el error no tiene arreglo cambiando de modelo', async () => {
    fetchMock.mockResolvedValue(exito('esto no es json'))
    const { aiService } = await cargarServicio()

    await expectAiError(aiService.analyze(ENTRADA), 'respuesta_invalida')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('envía el prompt con los datos de la planta', async () => {
    fetchMock.mockResolvedValue(exito(JSON.stringify(ANALISIS)))
    const { aiService } = await cargarServicio()

    await aiService.analyze(ENTRADA)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const cuerpo = JSON.parse(init.body as string) as { contents: Array<{ parts: Array<{ text?: string }> }> }
    const prompt = cuerpo.contents[0]?.parts[0]?.text ?? ''

    expect(prompt).toContain('Monstera del salón')
    expect(prompt).toContain('Monstera deliciosa')
    expect(prompt).toContain('13')
    expect(prompt).toContain('¿Hay que regar ahora?')
  })
})

describe('aiService.isConfigured', () => {
  it('es false cuando no hay clave guardada', async () => {
    mockSettingsGet.mockResolvedValue({ modelo: 'm', modeloFallback: 'r', recordatorios: AJUSTES.recordatorios })
    const { aiService, precargarAjustes } = await cargarServicio()

    await precargarAjustes()
    expect(aiService.isConfigured()).toBe(false)
  })

  it('es true en cuanto hay clave guardada', async () => {
    const { aiService, precargarAjustes } = await cargarServicio()

    await precargarAjustes()
    expect(aiService.isConfigured()).toBe(true)
  })

  it('ignora una clave que solo son espacios', async () => {
    mockSettingsGet.mockResolvedValue({ ...AJUSTES, apiKey: '   ' })
    const { aiService, precargarAjustes } = await cargarServicio()

    await precargarAjustes()
    expect(aiService.isConfigured()).toBe(false)
  })
})