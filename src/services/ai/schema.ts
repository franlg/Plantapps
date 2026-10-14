import { z } from 'zod'
import type { AiAnalysisDraft } from '@/types'
import { AiError } from '@/types'

/**
 * CONTRATO CON EL MODELO
 * ======================
 * El mismo esquema vive en dos sitios:
 *  1. `ESQUEMA_ANALISIS` (Zod): valida lo que vuelve del modelo. Es la verdad.
 *  2. `responseSchemaGemini()`: el mismo esquema traducido al JSON Schema que
 *     entiende `generationConfig.responseSchema`, con descripciones para que el
 *     modelo sepa qué significa cada campo.
 * Si tocas uno, toca el otro.
 */

export const VEREDICTOS = ['regar', 'no_regar', 'trasplantar', 'problema', 'todo_ok'] as const
export const CONFIANZAS = ['alta', 'media', 'baja'] as const
export const GRAVEDADES = ['ninguna', 'leve', 'moderada', 'grave'] as const

export const MAX_ACCION = 160
export const MIN_SALUD = 0
export const MAX_SALUD = 100
export const MIN_FRECUENCIA = 1
export const MAX_FRECUENCIA = 90

/**
 * Validación estricta de la respuesta del modelo.
 * Campos obligatorios tal y como los define `AiAnalysisDraft`.
 */
export const ESQUEMA_ANALISIS: z.ZodType<AiAnalysisDraft> = z.object({
  veredicto: z.enum(VEREDICTOS).describe('La conclusión principal sobre qué hay que hacer ahora'),
  salud: z
    .int()
    .min(MIN_SALUD)
    .max(MAX_SALUD)
    .describe('Estado general de la planta de 0 (muy mal) a 100 (perfecta)'),
  accionPrincipal: z
    .string()
    .trim()
    .min(1)
    .max(MAX_ACCION)
    .describe('Lo único que tiene que hacer el usuario, en imperativo y corto'),
  regar: z.boolean().describe('true solo si hay que regar ahora mismo'),
  frecuenciaRiegoDias: z
    .int()
    .min(MIN_FRECUENCIA)
    .max(MAX_FRECUENCIA)
    .nullable()
    .describe('Días entre riegos que recomienda, o null si no se puede estimar'),
  problema: z.string().optional().describe('El problema detectado en una frase, o "Ninguno"'),
  gravedad: z.enum(GRAVEDADES).optional().describe('Gravedad del problema: ninguna, leve, moderada o grave'),
  sintomas: z.array(z.string()).describe('Signos visibles en la foto: "hojas amarillas en la base"'),
  recomendaciones: z.array(z.string()).describe('Acciones concretas: "mover a media sombra", "abonar"'),
  confianza: z.enum(CONFIANZAS).describe('Cuánto se fía el modelo de su propio diagnóstico'),
  resumen: z.string().trim().min(1).describe('1-3 frases en lenguaje sencillo para el usuario'),
})

/**
 * El mismo esquema en el formato de `generationConfig.responseSchema`.
 * Gemini lee las `description`, así que ahí va el "para qué sirve" de cada campo.
 */
export function responseSchemaGemini(): object {
  return {
    type: 'object',
    properties: {
      veredicto: {
        type: 'string',
        format: 'enum',
        enum: [...VEREDICTOS],
        description:
          'Qué hay que hacer ahora con la planta. Usa "regar" si toca regar, "no_regar" si aguanta, ' +
          '"trasplantar" si necesita más espacio, "problema" si hay un problema visible y "todo_ok" si está perfecta.',
      },
      salud: {
        type: 'integer',
        description:
          'Salud general de 0 a 100. 90-100 excelente, 70-89 bien, 40-69 regular, 0-39 mal. ' +
          'Valora la planta entera, no solo la parte visible en la foto.',
      },
      accionPrincipal: {
        type: 'string',
        description:
          'La ÚNICA acción prioritaria, en imperativo y en una línea: "Riega en profundidad esta semana", ' +
          '"Traspásala a una maceta de 5 cm mayor". Máximo 160 caracteres. Sin emojis ni explicaciones.',
      },
      regar: {
        type: 'boolean',
        description: 'true únicamente si hay que regar ahora mismo; false si la planta todavía aguanta.',
      },
      frecuenciaRiegoDias: {
        type: 'integer',
        nullable: true,
        description:
          'Cada cuántos días conviene regarla, entre 1 y 90. Usa null si no puedes estimarlo con la foto y los datos.',
      },
      problema: {
        type: 'string',
        description:
          'El problema que ves, descrito en una frase ("exceso de agua, tierra empapada"). Si no hay ninguno, escribe "Ninguno".',
      },
      gravedad: {
        type: 'string',
        format: 'enum',
        enum: [...GRAVEDADES],
        description:
          'Cuán grave es el problema: "ninguna" si está sana, "leve" (hojas amarillas sueltas), ' +
          '"moderada" (varias hojas caídas) o "grave" (tierra podrida, tallos blandos o podridumbre).',
      },
      sintomas: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Solo signos que se ven en la foto, sin interpretar: "hojas amarillas en la base", ' +
          '"bordes marrones y crujientes", "suelo mojado". Si no ves nada, lista vacía.',
      },
      recomendaciones: {
        type: 'array',
        items: { type: 'string' },
        description:
          'De 1 a 3 acciones prácticas y concretas para recuperar la planta. Escríbelas como órdenes cortas: ' +
          '"mueve la maceta a media sombra", "deja secar la tierra antes de regar".',
      },
      confianza: {
        type: 'string',
        format: 'enum',
        enum: [...CONFIANZAS],
        description:
          '"alta" si la foto es clara y el diagnóstico es evidente; "media" con dudas; ' +
          '"baja" si la foto no permite decidir (oscura, borrosa, parcial).',
      },
      resumen: {
        type: 'string',
        description:
          'De 1 a 3 frases en lenguaje sencillo para alguien que no sabe de plantas. ' +
          'Si no estás seguro, dilo aquí y baja la confianza.',
      },
    },
    // El orden debe coincidir con el de `properties`.
    // `frecuenciaRiegoDias` admite null, así que queda fuera de `required`.
    required: [
      'veredicto',
      'salud',
      'accionPrincipal',
      'regar',
      'problema',
      'gravedad',
      'sintomas',
      'recomendaciones',
      'confianza',
      'resumen',
    ],
  }
}

/** Campos que el esquema declara opcionales: si vienen null o vacíos, se descartan. */
const OPCIONALES_ANULABLES = ['problema', 'gravedad'] as const

/**
 * Limpieza mínima antes de validar.
 * - Se elimina lo que venga como `undefined` o `null` en campos opcionales.
 * - Un `problema` en blanco se considera ausente (no aporta nada).
 * - Si falta `frecuenciaRiegoDias`, se cuenta como `null`: el modelo lo omite
 *   cuando no quiere arriesgarse a inventar un número.
 */
function normalizar(entrada: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}

  for (const [clave, valor] of Object.entries(entrada)) {
    if (valor === undefined) continue
    if (valor === null && (OPCIONALES_ANULABLES as readonly string[]).includes(clave)) continue
    if (clave === 'problema' && typeof valor === 'string' && valor.trim() === '') continue
    salida[clave] = valor
  }

  if (!('frecuenciaRiegoDias' in salida)) salida.frecuenciaRiegoDias = null

  return salida
}

/**
 * Quita las envolturas de markdown (```json ... ```) que algunos modelos añaden
 * y, si queda texto alrededor, recorta del primer `{` al último `}`.
 */
export function desenvolverJson(texto: string): string {
  const limpio = texto.trim()
  const envuelto = limpio.match(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/)

  const cuerpo = envuelto?.[1]?.trim() ? envuelto[1].trim() : limpio.replace(/^```[a-zA-Z0-9_-]*/i, '').replace(/```+\s*$/, '').trim()

  const inicio = cuerpo.indexOf('{')
  const fin = cuerpo.lastIndexOf('}')

  return inicio !== -1 && fin > inicio ? cuerpo.slice(inicio, fin + 1) : cuerpo
}

const errorRespuestaInvalida = () =>
  new AiError('La respuesta de la IA no se ha podido interpretar', 'respuesta_invalida')

/**
 * Convierte lo que devuelve el modelo en un `AiAnalysisDraft` validado.
 * Acepta el texto de la respuesta o el objeto ya parseado.
 * Lanza `AiError('respuesta_invalida')` si no encaja con el esquema.
 */
export function parsearAnalisis(textoDesconocido: unknown): AiAnalysisDraft {
  let datos: unknown = textoDesconocido

  if (typeof textoDesconocido === 'string') {
    const json = desenvolverJson(textoDesconocido)
    try {
      datos = JSON.parse(json)
    } catch {
      throw errorRespuestaInvalida()
    }
  }

  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
    throw errorRespuestaInvalida()
  }

  const resultado = ESQUEMA_ANALISIS.safeParse(normalizar(datos as Record<string, unknown>))

  if (!resultado.success) throw errorRespuestaInvalida()

  return resultado.data
}