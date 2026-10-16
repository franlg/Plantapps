import { AiError } from '@/types'
import { responseSchemaGemini } from './schema'

/**
 * Cliente mínimo de la API de Gemini.
 *
 * Todas las funciones de la capa (análisis, guía e identificación) caben en una
 * llamada a `generateContent`, así que no se monta ningún SDK: un `fetch` con
 * cabeceras, base64 y traducción de errores. La imagen es opcional (la guía se
 * puede pedir solo con texto) y puede haber DOS (`foto` + `fotoAnterior`), que
 * es lo que permite comparar la planta con su análisis anterior. El esquema de
 * respuesta lo elige quien llama.
 * La clave viaja en la cabecera `x-goog-api-key` y NUNCA se escribe en el código,
 * ni en los logs, ni en los mensajes de error que ve el usuario.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/** En móvil, 30 s es de sobra; si no responde, es que no va a responder. */
export const TIMEOUT_MS = 30_000

const TEMPERATURA = 0.3

export interface LlamarGeminiParams {
  apiKey: string
  modelo: string
  prompt: string
  /** Foto ya comprimida (JPEG o PNG). Opcional: hay llamadas solo de texto. */
  foto?: Blob
  /**
   * Foto del análisis anterior, para que el modelo compare las dos.
   *
   * Se manda en la MISMA petición que `foto`, como segundo `inline_data` dentro
   * del mismo `parts`: Gemini lee las imágenes en el orden en que llegan, así
   * que el prompt dice cuál es cada una. Mandarlas juntas es lo que hace
   * posible la comparación (dos peticiones distintas no comparten contexto).
   *
   * Decisión de diseño: se añade este parámetro en lugar de sustituir `foto`
   * por un `fotos?: Blob[]`. Con el array habría que reescribir todas las
   * llamadas actuales (análisis, guía e identificación) y el significado de
   * cada foto viviría en el orden del array, no en el nombre; con `foto` +
   * `fotoAnterior` el contrato se lee solo y el que se pasa una única foto
   * (la mayoría de los casos) no cambia en nada.
   */
  fotoAnterior?: Blob
  /** Esquema que se le pide al modelo. Por defecto, el del análisis de foto. */
  responseSchema?: object
}

/**
 * Las imágenes de la petición, en el orden en el que las ve el modelo:
 * primero la foto actual, después la anterior.
 */
export function imagenesDeLaPeticion({ foto, fotoAnterior }: Pick<LlamarGeminiParams, 'foto' | 'fotoAnterior'>): Blob[] {
  return [foto, fotoAnterior].filter((imagen): imagen is Blob => imagen !== undefined)
}

export interface LlamarGeminiResultado {
  /** Texto que devuelve el modelo (el JSON, normalmente). */
  texto: string
  /** Cuerpo crudo de la respuesta, para depurar. */
  raw: unknown
}

/** `true` si el valor es un objeto plano: así se puede leer sin castear a `any`. */
function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** Nombre del error si lo tiene (`AbortError`, `TypeError`...). */
function nombreDeError(error: unknown): string {
  return esRegistro(error) && typeof error.name === 'string' ? error.name : ''
}

/**
 * Convierte el Blob en base64 por trozos.
 * `String.fromCharCode(...bytes)` entero revienta la pila con fotos reales
 * (varios MB), así que se recorre en bloques de 32 KB.
 */
export async function blobABase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const TROZO = 0x8000

  let binario = ''
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO))
  }

  return btoa(binario)
}

/** Texto del modelo: concatena los `text` de todos los `parts` de todos los candidatos. */
function extraerTexto(cuerpo: unknown): string | null {
  if (!esRegistro(cuerpo) || !Array.isArray(cuerpo.candidates) || cuerpo.candidates.length === 0) return null

  const textos: string[] = []

  for (const candidato of cuerpo.candidates as unknown[]) {
    if (!esRegistro(candidato) || !esRegistro(candidato.content)) continue
    const partes = candidato.content.parts
    if (!Array.isArray(partes)) continue

    for (const parte of partes as unknown[]) {
      if (esRegistro(parte) && typeof parte.text === 'string') textos.push(parte.text)
    }
  }

  return textos.length > 0 ? textos.join('') : null
}

/** Detalle legible del error de la API, sin filtrar nada sensible. */
function detalleDeError(cuerpo: unknown): string {
  if (typeof cuerpo === 'string') return cuerpo.slice(0, 300)
  if (esRegistro(cuerpo) && esRegistro(cuerpo.error) && typeof cuerpo.error.message === 'string') {
    return cuerpo.error.message.slice(0, 300)
  }
  return ''
}

/** Traduce un `Response` con error a un `AiError` de la app. */
function errorDeHttp(status: number, detalle: string): AiError {
  const limpio = detalle.trim()

  switch (status) {
    case 429:
      return new AiError(
        limpio
          ? `Has agotado la cuota gratuita de Gemini: ${limpio}`
          : 'Has agotado la cuota gratuita de Gemini. Espera unos minutos y vuelve a intentarlo.',
        'cuota',
      )
    case 404:
      return new AiError(
        limpio && /not found|not supported|no encontrado/i.test(limpio)
          ? `Ese modelo no está disponible para tu clave: ${limpio}`
          : 'Ese modelo no está disponible para tu clave. Cámbialo en Ajustes.',
        'modelo_no_disponible',
      )
    case 502:
    case 503:
    case 504:
      // Gemini responde así cuando el modelo está saturado ("high demand"). Verificado
      // el 14/10/2026: gemini-3.8-flash devolvía 503 con una clave del nivel gratuito.
      // Se clasifica como "modelo no disponible" para que la app reintente con el de respaldo.
      return new AiError(
        status === 503
          ? 'Ese modelo está saturado ahora mismo. Se probará con el modelo de respaldo.'
          : 'Gemini no ha podido atender la petición. Se probará con el modelo de respaldo.',
        'modelo_no_disponible',
      )
    case 400:
      return new AiError(
        `Gemini rechazó la petición (la foto o el modelo no valen): ${limpio || 'revisa el modelo en Ajustes'}`,
        'desconocido',
      )
    case 401:
    case 403:
      return new AiError(
        'La clave de la API no es válida o no tiene permiso para usar Gemini. Revísala en Ajustes.',
        'desconocido',
      )
    default:
      return new AiError(
        `Gemini ha devuelto un error ${status}${limpio ? `: ${limpio}` : ''}`,
        'desconocido',
      )
  }
}

/**
 * Hace una llamada a Gemini y devuelve el texto de la respuesta.
 * Lanza siempre `AiError` con un código de @/types para que la interfaz sepa
 * qué mensaje mostrar.
 */
export async function llamarGemini({
  apiKey,
  modelo,
  prompt,
  foto,
  fotoAnterior,
  responseSchema = responseSchemaGemini(),
}: LlamarGeminiParams): Promise<LlamarGeminiResultado> {
  const url = `${API_BASE}/${encodeURIComponent(modelo)}:generateContent`

  // Sin foto (la guía se puede pedir solo con los datos de la planta) no se manda
  // la parte `inline_data`: Gemini acepta peticiones solo de texto.
  // Con dos fotos van las dos en el mismo `parts`, la actual primero: es el
  // orden que el prompt promete.
  const partes: object[] = [{ text: prompt }]
  for (const imagen of imagenesDeLaPeticion({ foto, fotoAnterior })) {
    partes.push({
      inline_data: {
        mime_type: imagen.type || 'image/jpeg',
        data: await blobABase64(imagen),
      },
    })
  }

  const cuerpo = {
    contents: [
      {
        role: 'user',
        parts: partes,
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: TEMPERATURA,
    },
  }

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  let respuesta: Response
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(cuerpo),
      signal: controlador.signal,
    })
  } catch (error) {
    // El AbortError del temporizador cae aquí también: misma causa para el usuario.
    if (nombreDeError(error) === 'AbortError') {
      throw new AiError(
        `Gemini no ha respondido en ${TIMEOUT_MS / 1000} segundos. Revisa la conexión y vuelve a intentarlo.`,
        'sin_red',
      )
    }
    throw new AiError('No se ha podido conectar con Gemini. Revisa la conexión a internet.', 'sin_red')
  } finally {
    clearTimeout(temporizador)
  }

  const textoRespuesta = await respuesta.text().catch(() => '')
  let cuerpoRespuesta: unknown = null

  if (textoRespuesta) {
    try {
      cuerpoRespuesta = JSON.parse(textoRespuesta)
    } catch {
      cuerpoRespuesta = textoRespuesta
    }
  }

  if (!respuesta.ok) {
    const detalle = detalleDeError(cuerpoRespuesta)
    // Hay APIs que responden 400 con un 404 en el cuerpo (modelo inexistente).
    if (/model .*not found|is not found for API version|models\/.+ is not supported/i.test(detalle)) {
      throw errorDeHttp(404, detalle)
    }
    throw errorDeHttp(respuesta.status, detalle)
  }

  const texto = extraerTexto(cuerpoRespuesta)

  if (texto === null) {
    // El mensaje cambia según hubiera imagen que mirar: con foto el usuario
    // entiende "vuelve a intentarlo con otra imagen"; sin ella, es la respuesta
    // la que falta. `fotoAnterior` sola también cuenta como imagen.
    const habiaImagen = foto !== undefined || fotoAnterior !== undefined

    throw new AiError(
      habiaImagen
        ? 'Gemini no ha devuelto ningún análisis de la foto. Vuelve a intentarlo con otra imagen.'
        : 'Gemini no ha devuelto ninguna respuesta. Vuelve a intentarlo.',
      'respuesta_invalida',
    )
  }

  return { texto, raw: cuerpoRespuesta }
}