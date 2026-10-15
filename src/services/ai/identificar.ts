import { z } from 'zod'
import type { IdentificacionDraft, Luz } from '@/types'
import { CONFIANZAS, errorDeRespuestaInvalida, leerObjetoJson, MAX_FRECUENCIA, MIN_FRECUENCIA } from './schema'

/**
 * IDENTIFICACIÓN DE ESPECIES
 * ==========================
 * El caso difícil de la app: el usuario tiene una planta y no sabe qué es. Aquí
 * no hay nada que "arreglar" si el modelo no está seguro, así que la respuesta
 * válida por defecto es `especie: null` con confianza "baja": es preferible no
 * rellenar la ficha antes que ponerle el nombre de la especie equivocada, que
 * el usuario no va a corregir porque no sabe distinguirla.
 *
 * Igual que en `schema.ts`: el esquema Zod manda, y
 * `identificacionResponseSchemaGemini()` es su traducción al JSON Schema de
 * Gemini. Los campos que pueden faltar usan `.nullish()`, no `.optional()`: así
 * "viene", "viene null" y "no viene" son lo mismo y salen siempre como `null`.
 */

/** Máximo de especies alternativas que se ofrecen: más solo confunde. */
export const MAX_ALTERNATIVAS = 3

const LUCES = ['sol_directo', 'sol_indirecto', 'sombra', 'interior'] as const

/** Texto honesto para cuando el modelo identifica sin decir por qué. */
export const MOTIVO_SIN_RAZON = 'El modelo no ha justificado la identificación.'

/** Viene, viene null o no viene: los tres casos salen igual. */
const textoONull = z
  .string()
  .trim()
  .min(1)
  .nullish()
  .transform((valor) => valor ?? null)

const frecuenciaONull = z
  .int()
  .min(MIN_FRECUENCIA)
  .max(MAX_FRECUENCIA)
  .nullish()
  .transform((valor) => valor ?? null)

const luzONull = z
  .enum(LUCES)
  .nullish()
  .transform((valor) => valor ?? null)

const alternativasONull = z
  .array(z.string().trim().min(1))
  .nullish()
  .transform((valor) => valor?.slice(0, MAX_ALTERNATIVAS) ?? [])

export const IDENTIFICACION_ESQUEMA: z.ZodType<IdentificacionDraft> = z.object({
  especie: textoONull.describe('Nombre científico en formato binomial, o null si la foto no permite decidir'),
  nombreComun: textoONull.describe('Nombre común en castellano, o null si no se reconoce'),
  familia: textoONull.describe('Familia botánica, o null si no se reconoce'),
  confianza: z.enum(CONFIANZAS).describe('Cuánto se fía el modelo de su propia identificación'),
  razon: z.string().trim().min(1).describe('Por qué cree que es esa, en una frase'),
  alternativas: alternativasONull.describe(`Hasta ${MAX_ALTERNATIVAS} especies parecidas, si las hay`),
  frecuenciaRiegoDias: frecuenciaONull.describe('Días entre riegos que necesita la especie, o null'),
  luz: luzONull.describe('Luz que necesita la especie, o null'),
})

/** El mismo esquema en el formato de `generationConfig.responseSchema`. */
export function identificacionResponseSchemaGemini(): object {
  return {
    type: 'object',
    properties: {
      especie: {
        type: 'string',
        nullable: true,
        description:
          'Nombre científico en formato binomial ("Monstera deliciosa"). Si la foto no permite decidir con ' +
          'seguridad, devuelve null en lugar de adivinar: es preferible que la aplicación no rellene nada.',
      },
      nombreComun: {
        type: 'string',
        nullable: true,
        description: 'Nombre común en castellano ("Monstera", "Potus"). Null si no lo reconoces.',
      },
      familia: {
        type: 'string',
        nullable: true,
        description: 'Familia botánica ("Araceae"). Null si no la reconoces con seguridad.',
      },
      confianza: {
        type: 'string',
        format: 'enum',
        enum: [...CONFIANZAS],
        description:
          '"alta" solo si reconoces la especie sin lugar a dudas; "media" con alguna duda razonable; ' +
          '"baja" si la foto es oscura, borrosa, parcial o hay varias especies parecidas. ' +
          'Si "especie" es null, la confianza tiene que ser "baja".',
      },
      razon: {
        type: 'string',
        description:
          'En una frase, qué se ve en la foto que ha decidido la identificación. Cita rasgos observables: ' +
          '"hojas grandes con lóbulos y nervaduras marcadas". Si no puedes decidir, explica por qué en su lugar.',
      },
      alternativas: {
        type: 'array',
        maxItems: MAX_ALTERNATIVAS,
        items: { type: 'string' },
        description:
          `Hasta ${MAX_ALTERNATIVAS} especies que se le parecen y entre las que el usuario podría estar dudando. ` +
          'Nombres científicos. Lista vacía si solo hay una opción razonable.',
      },
      frecuenciaRiegoDias: {
        type: 'integer',
        nullable: true,
        description:
          'Días entre riegos que necesita esta especie en una casa normal, entre 1 y 90. La aplicación lo usa para ' +
          'rellenar la ficha de la planta, así que ajústate a lo típico de la especie. Null si no lo sabes.',
      },
      luz: {
        type: 'string',
        format: 'enum',
        enum: [...LUCES],
        nullable: true,
        description:
          'La luz que necesita la especie. La aplicación la usa para rellenar la ficha de la planta: ' +
          '"sol_directo", "sol_indirecto", "sombra" o "interior". Null si no lo sabes.',
      },
    },
    // Todo lo que admite null queda fuera de `required`: el modelo puede omitirlo.
    required: ['confianza', 'razon', 'alternativas'],
  }
}

/** Sin acentos, en minúsculas y con guiones bajos: "Sol directo" → "sol_directo". */
function plegar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
}

/**
 * La luz a veces vuelve como etiqueta en castellano ("Sol indirecto") en vez de
 * como código. Se acepta igual: la app guarda el código. Si no es ninguna de las
 * cuatro, no es una luz: se descarta.
 */
function normalizarLuz(valor: unknown): Luz | null {
  if (typeof valor !== 'string') return null

  const plegada = plegar(valor)
  return (LUCES as readonly string[]).includes(plegada) ? (plegada as Luz) : null
}

/** Un entero dentro del rango admitido, o null: no vale la pena fallar por un 120. */
function normalizarFrecuencia(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) return null
  return valor >= MIN_FRECUENCIA && valor <= MAX_FRECUENCIA ? valor : null
}

/** Texto no vacío y sin rodeos, o null. */
function limpiarTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

/** Solo especies que son texto de verdad, sin repetir la identificada ni repetir entre sí. */
function normalizarAlternativas(valor: unknown, especie: string | null): string[] {
  if (!Array.isArray(valor)) return []

  const vistas = new Set<string>()
  const salida: string[] = []

  for (const bruto of valor) {
    if (typeof bruto !== 'string') continue

    const alternativa = bruto.trim()
    if (!alternativa) continue

    const clave = alternativa.toLowerCase()
    if (clave === especie?.toLowerCase() || vistas.has(clave)) continue

    vistas.add(clave)
    salida.push(alternativa)

    if (salida.length >= MAX_ALTERNATIVAS) break
  }

  return salida
}

/**
 * Limpieza antes de validar. La tolerancia va en un solo sentido: el modelo puede
 * ser demasiado optimista, así que cualquier duda se resuelve a la baja.
 */
function normalizar(datos: Record<string, unknown>): Record<string, unknown> {
  const especie = limpiarTexto(datos.especie)
  const confianza = datos.confianza
  const confianzaValida =
    typeof confianza === 'string' && (CONFIANZAS as readonly string[]).includes(confianza) ? confianza : null

  return {
    especie,
    nombreComun: limpiarTexto(datos.nombreComun),
    familia: limpiarTexto(datos.familia),
    // No nombrar la especie y estar seguro son cosas incompatibles.
    confianza: especie !== null && confianzaValida !== null ? confianzaValida : 'baja',
    razon: limpiarTexto(datos.razon) ?? MOTIVO_SIN_RAZON,
    alternativas: normalizarAlternativas(datos.alternativas, especie),
    frecuenciaRiegoDias: normalizarFrecuencia(datos.frecuenciaRiegoDias),
    luz: normalizarLuz(datos.luz),
  }
}

/**
 * Convierte lo que devuelve el modelo en un `IdentificacionDraft` validado.
 * `especie: null` es una respuesta buena, no un error: no lanza.
 * Lanza `AiError('respuesta_invalida')` si lo que llega no es un objeto.
 */
export function parsearIdentificacion(textoDesconocido: unknown): IdentificacionDraft {
  const resultado = IDENTIFICACION_ESQUEMA.safeParse(normalizar(leerObjetoJson(textoDesconocido)))

  if (!resultado.success) throw errorDeRespuestaInvalida()

  return resultado.data
}

export interface PromptIdentificarOpciones {
  /** Si la petición lleva foto. Sin foto solo se puede tirar de las pistas. */
  tieneFoto: boolean
  /** Lo que el usuario ya sabe, para que no se lo pregunte. */
  pistas?: string
}

const REGLAS = `- Responde ÚNICAMENTE con un objeto JSON válido que cumpla el esquema de la respuesta. Nada de texto antes ni después.
- Escribe todo en español.
- Si no reconoces la especie con una confianza razonable, devuelve "especie": null y "confianza": "baja". Es preferible no rellenar la ficha antes que poner el nombre equivocado.
- "razon": una frase con rasgos que se ven en la foto ("hojas grandes con lóbulos"), no suposiciones.
- "alternativas": hasta ${MAX_ALTERNATIVAS} nombres científicos de especies parecidas. Lista vacía si solo hay una opción.
- "frecuenciaRiegoDias" y "luz": lo típico de la especie, que la aplicación usará para rellenar la ficha. Null si no lo sabes.`

/** Bloque de pistas del usuario, o null si no ha escrito nada. */
function bloquePistas(pistas: string | undefined): string | null {
  const texto = pistas?.trim()
  return texto ? `PISTAS DEL USUARIO (pueden contradecir lo que tú veas):\n${texto}` : null
}

/**
 * Prompt de la identificación.
 * Con foto, el modelo decide con lo que ve; sin ella, se le pide que sea
 * prudente con lo que el usuario cuenta.
 */
export function construirPromptIdentificar({ tieneFoto, pistas }: PromptIdentificarOpciones): string {
  const conPistas = bloquePistas(pistas)

  const encabezado = tieneFoto
    ? `Tienes UNA foto de la planta. Fíjate en la forma de las hojas, el tallo, el color, el porte y si hay flores o frutos.`
    : `NO hay foto: solo puedes responder con lo que te cuentan. Si con eso no hay suficiente, devuelve "especie": null.`

  return `Eres un botánico experto identificando plantas de interior a partir de una foto.
Alguien te ha enviado ${tieneFoto ? 'una foto de una planta' : 'la descripción de una planta'} y quiere saber qué especie es. Todavía no lo sabe y depende de tu respuesta.

${encabezado}
${conPistas ? `\n${conPistas}\n` : ''}
LO QUE TIENES QUE RESPONDER:
1. ¿Qué especie es? Nombre científico en formato binomial, o null si no se puede decidir.
2. ¿Cómo se llama en castellano?
3. ¿A qué familia pertenece?
4. ¿Qué tan seguro estás: "alta", "media" o "baja"?
5. ¿Qué otras especies se le parecen y entre las que el usuario podría estar dudando?
6. ¿Cada cuántos días conviene regarla y con qué luz? La aplicación rellena la ficha de la planta con estos dos datos.

REGLAS DE FORMATO:
${REGLAS}`
}