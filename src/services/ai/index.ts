import type { AiAnalyzeInput, AiAnalysisDraft, AppSettings } from '@/types'
import type { AiService } from '@/services/contracts'
import { AiError } from '@/types'
import { db } from '@/db'
import { llamarGemini } from './gemini'
import { construirPrompt } from './prompt'
import { parsearAnalisis } from './schema'

/**
 * SERVICIO DE IA
 * ==============
 * El único punto de entrada de la app: `aiService.analyze(foto + contexto)`.
 *
 * Decisiones:
 * - La clave y los modelos salen de Ajustes (`db.settings`), nunca del código.
 * - `isConfigured()` es síncrono por contrato, así que se apoya en un caché de
 *   los ajustes: se precarga al importar el módulo y se invalida cada vez que
 *   la base de datos cambia de versión (guardar la clave en Ajustes lo refresca).
 * - Si el modelo principal no existe o se acaba la cuota, se reintenta UNA vez
 *   con el modelo de respaldo. Nunca más de 2 peticiones por análisis.
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

async function analizar(input: AiAnalyzeInput): Promise<AiAnalysisDraft> {
  const ajustes = await leerAjustes()

  const apiKey = ajustes.apiKey?.trim()
  if (!apiKey) throw FALTA_CLAVE()

  // `?? ''` por robustez: los ajustes vienen de disco y pueden venir incompletos.
  const principal = input.modelo?.trim() || ajustes.modelo?.trim() || ''
  const respaldo = ajustes.modeloFallback?.trim() ?? ''

  if (!principal) throw new AiError('No hay ningún modelo configurado. Elige uno en Ajustes.', 'modelo_no_disponible')

  const modelos = respaldo && respaldo !== principal ? [principal, respaldo] : [principal]

  const prompt = construirPrompt(input.contexto)
  let ultimoError: AiError | null = null

  for (const modelo of modelos) {
    try {
      const { texto } = await llamarGemini({ apiKey, modelo, prompt, foto: input.foto })
      return parsearAnalisis(texto)
    } catch (error) {
      if (!(error instanceof AiError)) {
        throw new AiError('No se ha podido analizar la planta. Vuelve a intentarlo.', 'desconocido')
      }

      ultimoError = error
      if (!REINTENTABLE.includes(error.codigo)) throw error
    }
  }

  throw ultimoError ?? new AiError('No se ha podido analizar la planta', 'desconocido')
}

export const aiService: AiService = {
  isConfigured() {
    return Boolean(ajustesCache?.apiKey?.trim())
  },
  analyze: analizar,
}