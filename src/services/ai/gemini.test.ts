import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiError } from '@/types'
import { blobABase64, llamarGemini } from './gemini'

const FOTO = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' })

const fetchMock = vi.fn()

/** Respuesta falsa con la forma que usa `llamarGemini`. */
function respuesta(status: number, cuerpo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
  } as Response
}

function okConTexto(texto: string): Response {
  return respuesta(200, { candidates: [{ content: { parts: [{ text: texto }] } }] })
}

function errorGemini(status: number, mensaje: string): Response {
  return respuesta(status, { error: { code: status, message: mensaje, status: 'ERROR' } })
}

function cuerpoDeLaPeticion(indice = 0): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[indice] as [string, RequestInit]
  return JSON.parse(init.body as string) as Record<string, unknown>
}

/** Las partes `inline_data` de la petición, en el orden en el que se mandan. */
function partesConInlineData(indice = 0): Array<Record<string, unknown>> {
  const contents = cuerpoDeLaPeticion(indice).contents as Array<{ parts: Array<Record<string, unknown>> }>
  return (contents[0]?.parts ?? []).filter((parte) => 'inline_data' in parte)
}

async function expectAiError(promesa: Promise<unknown>, codigo: string): Promise<AiError> {
  let error: unknown
  try {
    await promesa
  } catch (e) {
    error = e
  }
  expect(error).toBeInstanceOf(AiError)
  expect((error as AiError).codigo).toBe(codigo)
  return error as AiError
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('llamarGemini', () => {
  it('manda el prompt y la foto en base64 al modelo pedido', async () => {
    fetchMock.mockResolvedValue(okConTexto('{"veredicto":"todo_ok"}'))

    const resultado = await llamarGemini({
      apiKey: 'clave-secreta',
      modelo: 'gemini-3.8-flash',
      prompt: 'analiza esta planta',
      foto: FOTO,
    })

    expect(resultado.texto).toBe('{"veredicto":"todo_ok"}')
    expect(resultado.raw).toEqual({ candidates: [{ content: { parts: [{ text: '{"veredicto":"todo_ok"}' }] } }] })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('clave-secreta')

    const cuerpo = cuerpoDeLaPeticion()
    expect(cuerpo.contents).toEqual([
      {
        role: 'user',
        parts: [
          { text: 'analiza esta planta' },
          { inline_data: { mime_type: 'image/jpeg', data: 'AQIDBAU=' } },
        ],
      },
    ])

    const config = cuerpo.generationConfig as Record<string, unknown>
    expect(config.responseMimeType).toBe('application/json')
    expect(config.temperature).toBe(0.3)
    expect(config.responseSchema).toMatchObject({ type: 'object' })
  })

  it('codifica en base64 fotos grandes sin reventar la pila', async () => {
    const grande = new Blob([new Uint8Array(70_000).fill(65)], { type: 'image/png' })
    expect(await blobABase64(grande)).toBe(btoa('A'.repeat(70_000)))
  })

  it('manda solo el prompt cuando no hay foto', async () => {
    fetchMock.mockResolvedValue(okConTexto('{"especie":"Monstera deliciosa"}'))

    const resultado = await llamarGemini({ apiKey: 'clave-secreta', modelo: 'gemini-3.6-flash', prompt: 'guía de esta planta' })

    expect(resultado.texto).toBe('{"especie":"Monstera deliciosa"}')

    const cuerpo = cuerpoDeLaPeticion()
    expect(cuerpo.contents).toEqual([{ role: 'user', parts: [{ text: 'guía de esta planta' }] }])
    expect(JSON.stringify(cuerpo)).not.toContain('inline_data')
  })

  it('acepta el esquema de respuesta que le pase quien llama', async () => {
    fetchMock.mockResolvedValue(okConTexto('{}'))

    await llamarGemini({
      apiKey: 'k',
      modelo: 'm',
      prompt: 'p',
      responseSchema: { type: 'object', properties: { especie: { type: 'string' } }, required: ['especie'] },
    })

    const config = cuerpoDeLaPeticion().generationConfig as Record<string, unknown>
    expect(config.responseSchema).toEqual({
      type: 'object',
      properties: { especie: { type: 'string' } },
      required: ['especie'],
    })
  })

  it('avisa con otro mensaje si no hay texto y la llamada no era con foto', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { candidates: [] }))

    const error = await expectAiError(
      llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p' }),
      'respuesta_invalida',
    )
    expect(error.message).toContain('ninguna respuesta')
  })

  it('concatena varios parts de texto', async () => {
    fetchMock.mockResolvedValue(
      respuesta(200, { candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }] }),
    )

    const { texto } = await llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p', foto: FOTO })
    expect(texto).toBe('{"a":1}')
  })

  it('manda las DOS fotos en el mismo parts: primero la actual, después la anterior', async () => {
    fetchMock.mockResolvedValue(okConTexto('{"veredicto":"mejor"}'))

    const actual = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
    const anterior = new Blob([new Uint8Array([9, 8, 7])], { type: 'image/jpeg' })

    await llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'compara', foto: actual, fotoAnterior: anterior })

    expect(cuerpoDeLaPeticion().contents).toEqual([
      {
        role: 'user',
        parts: [
          { text: 'compara' },
          { inline_data: { mime_type: 'image/jpeg', data: btoa('\u0001\u0002\u0003') } },
          { inline_data: { mime_type: 'image/jpeg', data: btoa('\u0009\u0008\u0007') } },
        ],
      },
    ])
  })

  it('respeta el mime de cada foto', async () => {
    fetchMock.mockResolvedValue(okConTexto('{}'))

    await llamarGemini({
      apiKey: 'k',
      modelo: 'm',
      prompt: 'p',
      foto: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
      fotoAnterior: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    })

    const partes = partesConInlineData()
    expect(partes.map((parte) => (parte.inline_data as { mime_type: string }).mime_type)).toEqual([
      'image/jpeg',
      'image/png',
    ])
  })

  it('manda una sola imagen cuando no hay foto anterior', async () => {
    fetchMock.mockResolvedValue(okConTexto('{"veredicto":"todo_ok"}'))

    await llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p', foto: FOTO, fotoAnterior: undefined })

    expect(partesConInlineData()).toHaveLength(1)
  })

  it('manda la foto anterior incluso si no viene la actual, en lugar de perderla', async () => {
    fetchMock.mockResolvedValue(okConTexto('{}'))

    await llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p', fotoAnterior: FOTO })

    expect(partesConInlineData()).toHaveLength(1)
  })

  it('traduce el 429 a cuota', async () => {
    fetchMock.mockResolvedValue(errorGemini(429, 'Quota exceeded for quota metric'))

    const error = await expectAiError(
      llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p', foto: FOTO }),
      'cuota',
    )
    expect(error.message).toContain('cuota')
  })

  it('traduce el 404 a modelo_no_disponible', async () => {
    fetchMock.mockResolvedValue(errorGemini(404, 'models/ninguno is not found for API version v1beta'))

    const error = await expectAiError(
      llamarGemini({ apiKey: 'k', modelo: 'ninguno', prompt: 'p', foto: FOTO }),
      'modelo_no_disponible',
    )
    expect(error.message).toContain('modelo')
  })

  it('detecta "model not found" aunque venga con otro status', async () => {
    fetchMock.mockResolvedValue(errorGemini(400, 'The model `gemini-x` was not found'))

    await expectAiError(llamarGemini({ apiKey: 'k', modelo: 'gemini-x', prompt: 'p', foto: FOTO }), 'modelo_no_disponible')
  })

  it('trata el 503 de saturación como modelo no disponible, para que reintente con el respaldo', async () => {
    // Caso real del 14/10/2026: gemini-3.8-flash devolvía 503 "high demand" con clave gratuita.
    fetchMock.mockResolvedValue(errorGemini(503, 'This model is currently experiencing high demand.'))

    const error = await expectAiError(
      llamarGemini({ apiKey: 'k', modelo: 'gemini-3.8-flash', prompt: 'p', foto: FOTO }),
      'modelo_no_disponible',
    )
    expect(error.message).toContain('respaldo')
  })

  it('trata 502 y 504 como modelo no disponible', async () => {
    for (const status of [502, 504]) {
      fetchMock.mockResolvedValue(errorGemini(status, 'upstream error'))
      await expectAiError(
        llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p', foto: FOTO }),
        'modelo_no_disponible',
      )
    }
  })

  it('traduce 401 y 403 a desconocido con un mensaje accionable', async () => {
    fetchMock.mockResolvedValue(errorGemini(401, 'API key not valid'))

    const error = await expectAiError(llamarGemini({ apiKey: 'mala', modelo: 'm', prompt: 'p', foto: FOTO }), 'desconocido')
    expect(error.message).toContain('Ajustes')
    expect(error.message).not.toContain('mala')
  })

  it('traduce 400 a desconocido', async () => {
    fetchMock.mockResolvedValue(errorGemini(400, 'Invalid JSON payload received'))

    const error = await expectAiError(llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p', foto: FOTO }), 'desconocido')
    expect(error.message).toContain('Gemini rechazó la petición')
  })

  it('traduce la caída de red a sin_red', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await expectAiError(llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p', foto: FOTO }), 'sin_red')
    expect(error.message).toContain('conexión')
  })

  it('traduce el tiempo de espera agotado (AbortError) a sin_red', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'))

    const error = await expectAiError(llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p', foto: FOTO }), 'sin_red')
    expect(error.message).toContain('30')
  })

  it('avisa cuando la respuesta llega sin candidatos (bloqueo de seguridad)', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { candidates: [], promptFeedback: { blockReason: 'SAFETY' } }))

    const error = await expectAiError(
      llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p', foto: FOTO }),
      'respuesta_invalida',
    )
    expect(error.message).toContain('no ha devuelto ningún análisis')
  })

  it('con dos fotos, el aviso de "sin candidatos" sigue siendo el de la foto', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { candidates: [] }))

    const error = await expectAiError(
      llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p', foto: FOTO, fotoAnterior: FOTO }),
      'respuesta_invalida',
    )
    expect(error.message).toContain('ningún análisis de la foto')
  })

  it('avisa cuando la respuesta no es JSON', async () => {
    fetchMock.mockResolvedValue(respuesta(200, '<html>error</html>'))

    await expectAiError(llamarGemini({ apiKey: 'k', modelo: 'm', prompt: 'p', foto: FOTO }), 'respuesta_invalida')
  })

  it('nunca escribe la clave en los errores de la API', async () => {
    fetchMock.mockResolvedValue(errorGemini(400, 'Something went wrong'))

    const error = await expectAiError(
      llamarGemini({ apiKey: 'clave-ultra-secreta', modelo: 'm', prompt: 'p', foto: FOTO }),
      'desconocido',
    )
    expect(error.message).not.toContain('clave-ultra-secreta')
  })
})