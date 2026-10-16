import type { AiAnalyzeInput, AiAnalysisDraft, AppSettings, GuiaCuidadosDraft, GuiaInput, IdentificacionDraft, IdentificarInput } from '@/types'
import type { AiService } from '@/services/contracts'
import { AiError } from '@/types'
import { db } from '@/db'
import { llamarGemini } from './gemini'
import { guiaResponseSchemaGemini, construirPromptGuia, parsearGuia } from './guia'
import { construirPromptIdentificar, identificacionResponseSchemaGemini, parsearIdentificacion } from './identificar'
import { construirPrompt } from './prompt'
import { parsearAnalisis } from './schema'

/**
 * SERVICIO DE IA
 * ==============
 * El único punto de entrada de la app:
 * `analyze` (foto + contexto → diagnóstico), `generarGuia` (planta → ficha de
 * cuidados) e `identificar` (foto → especie, o null si no se puede saber).
 *
 * Decisiones:
 * - La clave y los modelos salen de Ajustes (`db.settings`), nunca del código.
 * - `isConfigured()` es síncrono por contrato, así que se apoya en un caché de
 *   los ajustes: se precarga al importar el módulo y se invalida cada vez que
 *   la base de datos cambia de versión (guardar la clave en Ajustes lo refresca).
 * - Si el modelo principal no existe o se acaba la cuota, se reintenta UNA vez
 *   con el modelo de respaldo. Nunca más de 2 peticiones por operación, sea la
 *   que sea (también con dos fotos: el respaldo recibe la petición entera).
 */

/** Ajustes cacheados para poder responder a `isConfigured()` sin esperar. */
let ajustesCache: AppSettings | null = null
let ajustesEnCurso: Promise<AppSettings> | null = null

/** Lee (y cachea) los ajustes. Nunca lanza: un fallo deja el caché a null. */
async function leerAjustes(): Promise<AppSettings> {
  if (!ajustesEnCurso) {
    ajustesEnCurso = (async () => {
      const ajustes = await db.settings.get()
      ajustesCache = ajustes
      return ajustes
    })().catch((error: unknown) => {
      ajustesEnCurso = null
      throw error
    })
  }

  return ajustesEnCurso
}

/** Llamar al guardar la clave en Ajustes, para no esperar al siguiente análisis. */
export function precargarAjustes(): Promise<void> {
  return leerAjustes().then(
    () => undefined,
    () => undefined,
  )
}

/** Los ajustes cambian sin avisar: cualquier escritura invalida el caché. */
db.subscribe(() => {
  ajustesCache = null
  ajustesEnCurso = null
})

// Precarga silenciosa para que el primer `isConfigured()` tenga algo que mirar.
void precargarAjustes()

const FALTA_CLAVE = () => new AiError('Falta la clave de la API. Añádela en Ajustes.', 'sin_clave')

/** Un fallo con el modelo se puede salvar cambiando de modelo. */
const REINTENTABLE: ReadonlyArray<AiError['codigo']> = ['modelo_no_disponible', 'cuota']

/**
 * Clave y lista de modelos con los que probar: primero el que pide la llamada
 * (o el de Ajustes), y el de respaldo detrás si son distintos.
 * Lanza antes de salir a la red si falta la clave o no hay ningún modelo.
 */
async function credenciales(modeloPedido: string | undefined): Promise<{ apiKey: string; modelos: string[] }> {
  const ajustes = await leerAjustes()

  const apiKey = ajustes.apiKey?.trim()
  if (!apiKey) throw FALTA_CLAVE()

  // `?? ''` por robustez: los ajustes vienen de disco y pueden venir incompletos.
  const principal = modeloPedido?.trim() || ajustes.modelo?.trim() || ''
  const respaldo = ajustes.modeloFallback?.trim() ?? ''

  if (!principal) throw new AiError('No hay ningún modelo configurado. Elige uno en Ajustes.', 'modelo_no_disponible')

  return {
    apiKey,
    modelos: respaldo && respaldo !== principal ? [principal, respaldo] : [principal],
  }
}

/**
 * Ejecuta `operacion` con el modelo principal y, solo si el fallo tiene arreglo
 * cambiando de modelo, repite UNA vez con el respaldo. Con dos modelos no hay
 * más de 2 peticiones, aunque los dos fallen.
 */
async function conReintento<T>(
  modelos: string[],
  operacion: (modelo: string) => Promise<T>,
  mensaje: string,
): Promise<T> {
  let ultimoError: AiError | null = null

  for (const modelo of modelos) {
    try {
      return await operacion(modelo)
    } catch (error) {
      if (!(error instanceof AiError)) {
        throw new AiError(mensaje, 'desconocido')
      }

      ultimoError = error
      if (!REINTENTABLE.includes(error.codigo)) throw error
    }
  }

  throw ultimoError ?? new AiError(mensaje, 'desconocido')
}

async function analizar(input: AiAnalyzeInput): Promise<AiAnalysisDraft> {
  const { apiKey, modelos } = await credenciales(input.modelo)
  // Solo se compara cuando la pantalla lo pide de verdad Y hay dos fotos que
  // mirar. Sin foto anterior no se manda nada: el prompt ni menciona la
  // comparación y `comparacion` viene ausente en la respuesta.
  const comparar = input.comparar === true && input.fotoAnterior !== undefined
  const prompt = construirPrompt(input.contexto, { tieneFotoAnterior: comparar })

  return conReintento(
    modelos,
    async (modelo) => {
      // Las dos fotos van en la MISMA petición (la actual primero). Si el
      // modelo principal falla, el respaldo recibe la petición completa:
      // cambiar de modelo no puede costarnos la comparación.
      const { texto } = await llamarGemini({
        apiKey,
        modelo,
        prompt,
        foto: input.foto,
        fotoAnterior: comparar ? input.fotoAnterior : undefined,
      })
      return parsearAnalisis(texto)
    },
    'No se ha podido analizar la planta. Vuelve a intentarlo.',
  )
}

/**
 * Ficha de cuidados de una planta. La foto es opcional (`GuiaInput.foto`): sin
 * ella el modelo solo recibe los datos que ya tiene de esa planta.
 */
async function generarGuia(input: GuiaInput): Promise<GuiaCuidadosDraft> {
  const { apiKey, modelos } = await credenciales(input.modelo)
  const prompt = construirPromptGuia(input.contexto)
  const responseSchema = guiaResponseSchemaGemini()

  return conReintento(
    modelos,
    async (modelo) => {
      const { texto } = await llamarGemini({ apiKey, modelo, prompt, foto: input.foto, responseSchema })
      return parsearGuia(texto)
    },
    'No se ha podido generar la guía de esta planta. Vuelve a intentarlo.',
  )
}

/**
 * Identifica la especie a partir de una foto. Si el modelo no está seguro
 * devuelve `especie: null`: eso ya es una respuesta válida, no un error.
 */
async function identificar(input: IdentificarInput): Promise<IdentificacionDraft> {
  const { apiKey, modelos } = await credenciales(input.modelo)
  const prompt = construirPromptIdentificar({ tieneFoto: Boolean(input.foto), pistas: input.pistas })
  const responseSchema = identificacionResponseSchemaGemini()

  return conReintento(
    modelos,
    async (modelo) => {
      const { texto } = await llamarGemini({ apiKey, modelo, prompt, foto: input.foto, responseSchema })
      return parsearIdentificacion(texto)
    },
    'No se ha podido identificar la planta. Vuelve a intentarlo.',
  )
}

export const aiService: AiService = {
  isConfigured() {
    return Boolean(ajustesCache?.apiKey?.trim())
  },
  analyze: analizar,
  generarGuia,
  identificar,
}