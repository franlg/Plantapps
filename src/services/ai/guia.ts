import { z } from 'zod'
import type { Dificultad, GuiaCuidadosDraft, GuiaInput, SeccionGuia } from '@/types'
import { errorDeRespuestaInvalida, leerObjetoJson, MAX_FRECUENCIA, MIN_FRECUENCIA } from './schema'
import { dato, fecha, luzEnEspañol } from './prompt'

/**
 * GUÍA DE CUIDADOS
 * ================
 * El análisis responde a "¿qué hago hoy?" con una foto. La guía es otra cosa:
 * texto de consulta para la pantalla de detalle, siempre con los mismos seis
 * apartados en el mismo orden. El modelo puede equivocarse o devolver cinco, así
 * que antes de validar se completa lo que falte: es preferible un apartado con
 * un texto honesto a perder la guía entera.
 *
 * Igual que en `schema.ts`, el esquema vive en dos sitios:
 *  1. `GUIA_ESQUEMA` (Zod): valida lo que vuelve del modelo. Es la verdad.
 *  2. `guiaResponseSchemaGemini()`: su traducción al JSON Schema de
 *     `generationConfig.responseSchema`, con descripciones porque el modelo las lee.
 */

/** Los seis apartados, siempre en este orden. La pantalla los pinta por posición. */
export const TITULOS_GUIA = [
  'Riego',
  'Luz',
  'Sustrato y maceta',
  'Temperatura',
  'Fertilización',
  'Problemas frecuentes',
] as const

export type TituloGuia = (typeof TITULOS_GUIA)[number]

const DIFICULTADES = ['facil', 'media', 'avanzada'] as const

/** Texto honesto para el apartado que el modelo no ha dado: mejor eso que fallar. */
export const CONTENIDO_POR_DEFECTO = 'Consulta la ficha de esta planta para más detalle.'

/** Palabras que delatan a cada apartado dentro del título que devuelve el modelo. */
const CLAVES: Record<TituloGuia, string[]> = {
  Riego: ['riego', 'regar', 'agua', 'hidrat'],
  Luz: ['luz', 'ilumin', 'sol', 'sombra'],
  'Sustrato y maceta': ['sustrato', 'tierra', 'suelo', 'maceta', 'plantel', 'trasplant', 'replant'],
  Temperatura: ['temperatur', 'clima', 'calor', 'frio', 'humedad', 'corriente'],
  Fertilización: ['fertiliz', 'abono', 'abonar', 'nutrient'],
  'Problemas frecuentes': ['problema', 'plaga', 'enfermedad', 'sintoma'],
}

const ESQUEMA_SECCION: z.ZodType<SeccionGuia> = z.object({
  titulo: z.string().trim().min(1).describe("Apartado de la guía: 'Riego', 'Luz', 'Sustrato y maceta'..."),
  contenido: z.string().trim().min(1).describe('Texto en lenguaje sencillo, de 2 a 5 frases'),
  puntos: z.array(z.string().trim().min(1)).optional().describe('Consejos sueltos, opcional'),
})

/** Validación estricta de la respuesta del modelo, ya normalizada a 6 secciones. */
export const GUIA_ESQUEMA: z.ZodType<GuiaCuidadosDraft> = z.object({
  nombreComun: z.string().trim().min(1).describe('Nombre común de la planta, como lo diría el usuario'),
  nombreCientifico: z.string().trim().min(1).describe('Nombre científico en formato binomial, o "Sin determinar"'),
  familia: z.string().trim().min(1).describe('Familia botánica, o "Desconocida" si no se sabe'),
  resumen: z.string().trim().min(1).describe('De 1 a 3 frases: qué es esta planta y qué le gusta'),
  secciones: z.array(ESQUEMA_SECCION).describe(`Siempre ${TITULOS_GUIA.length} apartados, en orden`),
  frecuenciaRiegoDias: z
    .int()
    .min(MIN_FRECUENCIA)
    .max(MAX_FRECUENCIA)
    .nullable()
    .describe('Días entre riegos que recomienda, o null si no se puede estimar'),
  dificultad: z.enum(DIFICULTADES).describe('Cuánto cuesta cuidarla para alguien novato'),
  basadaEnContexto: z
    .boolean()
    .describe('true si has usado los datos de esta planta concreta, no solo la especie'),
})

/** El mismo esquema en el formato de `generationConfig.responseSchema`. */
export function guiaResponseSchemaGemini(): object {
  return {
    type: 'object',
    properties: {
      nombreComun: {
        type: 'string',
        description: 'Nombre común de la planta, como lo diría una persona normal ("Monstera", "Cactus deChristmas").',
      },
      nombreCientifico: {
        type: 'string',
        description:
          'Nombre científico en formato binomial ("Monstera deliciosa"). Si no lo reconoces con seguridad, ' +
          'escribe "Sin determinar" en lugar de inventar uno.',
      },
      familia: {
        type: 'string',
        description: 'Familia botánica ("Araceae", "Cactaceae"). Si no la sabes, escribe "Desconocida".',
      },
      resumen: {
        type: 'string',
        description:
          'De 1 a 3 frases para leer de un vistazo: qué es esta planta y qué le gusta. En lenguaje sencillo, sin jerga.',
      },
      secciones: {
        type: 'array',
        minItems: TITULOS_GUIA.length,
        maxItems: TITULOS_GUIA.length,
        description: `SIEMPRE ${TITULOS_GUIA.length} apartados y en este orden exacto: ${TITULOS_GUIA.join(', ')}.`,
        items: {
          type: 'object',
          properties: {
            titulo: {
              type: 'string',
              description: `El nombre del apartado. Usa estos títulos: ${TITULOS_GUIA.join(', ')}.`,
            },
            contenido: {
              type: 'string',
              description:
                'El texto del apartado, de 2 a 5 frases, como si se lo explicaras a alguien que nunca ha tenido ' +
                'esa planta. Sin jerga técnica. Combina lo que sabes de la especie con los datos de esta planta.',
            },
            puntos: {
              type: 'array',
              items: { type: 'string' },
              description:
                'De 0 a 4 consejos sueltos y accionables ("deja secar la tierra entre riegos"). Opcional: si no ' +
                'tienes nada que añadir, no lo pongas.',
            },
          },
          required: ['titulo', 'contenido'],
        },
      },
      frecuenciaRiegoDias: {
        type: 'integer',
        nullable: true,
        description:
          'Cada cuántos días conviene regarla, entre 1 y 90, en esta maceta y esta ubicación. ' +
          'Usa null si no puedes estimarlo.',
      },
      dificultad: {
        type: 'string',
        format: 'enum',
        enum: [...DIFICULTADES],
        description:
          '"facil" si sobrevive a varios días sin riego, "media" si hay que vigilarla, ' +
          '"avanzada" si de verdad es para alguien novato.',
      },
      basadaEnContexto: {
        type: 'boolean',
        description:
          'true si la guía se apoya en los datos de esta planta concreta (maceta, ubicación, luz, cuánto lleva plantada), ' +
          'false solo si la has escrito de forma genérica para la especie.',
      },
    },
    // `frecuenciaRiegoDias` admite null, así que queda fuera de `required`.
    required: ['nombreComun', 'nombreCientifico', 'familia', 'resumen', 'secciones', 'dificultad', 'basadaEnContexto'],
  }
}

/** `true` si el valor es un objeto plano: así se puede leer sin castear a `any`. */
function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** Sin acentos, en minúsculas y con guiones bajos: para comparar títulos. */
function plegar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
}

/** Texto no vacío, o el texto por defecto que le pasemos. */
function texto(valor: unknown, porDefecto: string): string {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : porDefecto
}

/** Un entero dentro del rango admitido, o null: no vale la pena fallar por un 120. */
function frecuencia(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) return null
  return valor >= MIN_FRECUENCIA && valor <= MAX_FRECUENCIA ? valor : null
}

/** Los `puntos` del modelo: solo los que son texto de verdad. */
function puntosDe(valor: unknown): string[] | undefined {
  if (!Array.isArray(valor)) return undefined
  const puntos = valor.filter((p): p is string => typeof p === 'string' && p.trim() !== '').map((p) => p.trim())
  return puntos.length > 0 ? puntos : undefined
}

/**
 * Coloca cada apartado que devuelve el modelo en su hueco y rellena los que falten.
 *
 * No se fía del orden ni del título literal (el modelo puede escribir
 * "Iluminación" o "Agua y riego"): busca por palabras clave y, si sobran
 * apartados que no encajan en ninguno de los seis, se descartan. La pantalla
 * espera seis secciones fijas, ni más ni menos.
 */
function normalizarSecciones(valor: unknown): SeccionGuia[] {
  const lista = Array.isArray(valor) ? valor : []
  const huecos: (SeccionGuia | undefined)[] = TITULOS_GUIA.map(() => undefined)

  for (const crudo of lista) {
    if (!esRegistro(crudo)) continue

    const titulo = typeof crudo.titulo === 'string' ? crudo.titulo.trim() : ''
    if (!titulo) continue

    const plegado = plegar(titulo)
    const indice = TITULOS_GUIA.findIndex(
      (tituloFijo, i) => huecos[i] === undefined && CLAVES[tituloFijo].some((clave) => plegado.includes(clave)),
    )
    if (indice === -1) continue

    huecos[indice] = {
      titulo,
      contenido: texto(crudo.contenido, CONTENIDO_POR_DEFECTO),
      puntos: puntosDe(crudo.puntos),
    }
  }

  return huecos.map((seccion, i) => seccion ?? { titulo: TITULOS_GUIA[i], contenido: CONTENIDO_POR_DEFECTO })
}

/**
 * Limpieza antes de validar: convierte lo dudoso en un valor honesto en lugar de
 * dejar que reviente toda la guía.
 */
function normalizar(datos: Record<string, unknown>): Record<string, unknown> {
  const dificultad = datos.dificultad

  return {
    nombreComun: texto(datos.nombreComun, 'Planta sin nombre'),
    nombreCientifico: texto(datos.nombreCientifico, 'Sin determinar'),
    familia: texto(datos.familia, 'Desconocida'),
    resumen: texto(datos.resumen, 'Guía de cuidados para esta planta.'),
    secciones: normalizarSecciones(datos.secciones),
    frecuenciaRiegoDias: frecuencia(datos.frecuenciaRiegoDias),
    dificultad:
      typeof dificultad === 'string' && (DIFICULTADES as readonly string[]).includes(dificultad)
        ? (dificultad as Dificultad)
        : 'media',
    // El prompt siempre manda los datos de la planta, así que si el modelo no lo
    // dice explícitamente se da por hecho que los ha usado.
    basadaEnContexto: typeof datos.basadaEnContexto === 'boolean' ? datos.basadaEnContexto : true,
  }
}

/**
 * Convierte lo que devuelve el modelo en un `GuiaCuidadosDraft` validado.
 * Siempre sale con los seis apartados, en orden.
 * Lanza `AiError('respuesta_invalida')` si lo que llega no es un objeto.
 */
export function parsearGuia(textoDesconocido: unknown): GuiaCuidadosDraft {
  const resultado = GUIA_ESQUEMA.safeParse(normalizar(leerObjetoJson(textoDesconocido)))

  if (!resultado.success) throw errorDeRespuestaInvalida()

  return resultado.data
}

const APARTADOS = TITULOS_GUIA.map((titulo, i) => `${i + 1}. ${titulo}`).join('\n')

const REGLAS = `- Devuelve EXACTAMENTE ${TITULOS_GUIA.length} apartados, ni más ni menos, y en el orden de la lista.
- Responde ÚNICAMENTE con un objeto JSON válido que cumpla el esquema de la respuesta. Nada de texto antes ni después, ni comentarios.
- Escribe todo en español y en lenguaje sencillo: quien lee no es jardinero.
- No inventes datos que no se vean en la foto ni en los datos de la planta. Si no lo sabes, dilo con "Sin determinar", "Desconocida" o null.
- "resumen": de 1 a 3 frases, como si se lo explicaras a alguien que no sabe de plantas. Sin jerga.
- "contenido": de 2 a 5 frases por apartado. "puntos": solo si de verdad hay consejos sueltos que añadir.
- "frecuenciaRiegoDias": número entero de días entre riegos (de 1 a 90) o null si no puedes estimarlo.
- "basadaEnContexto": pon true si has tenido en cuenta la maceta, la ubicación, la luz o los días que lleva plantada.`

/** Los datos reales de la planta: son la mitad del prompt. */
function bloqueDatos(contexto: GuiaInput['contexto']): string {
  return [
    `- Nombre: ${contexto.nombre}`,
    dato('Especie', contexto.especie),
    contexto.diasDesdePlantado === null
      ? '- Días desde que se plantó: sin datos'
      : `- Días desde que se plantó: ${contexto.diasDesdePlantado}`,
    dato('Maceta', contexto.maceta),
    dato('Ubicación', contexto.ubicacion),
    `- Luz: ${luzEnEspañol(contexto.luz)}`,
    contexto.ultimoRiego === null
      ? '- Último riego: nunca se ha regado'
      : `- Último riego: ${fecha(contexto.ultimoRiego)}`,
  ].join('\n')
}

/**
 * Prompt de la guía. La foto es opcional: si no hay, la guía se hace solo con los
 * datos de la planta y la especie que el usuario ya escribió.
 */
export function construirPromptGuia(contexto: GuiaInput['contexto']): string {
  return `Eres un experto en el cuidado de plantas de interior. Escribes fichas de consulta que una persona sin conocimientos de botánica va a leer de principio a fin.

DATOS DE LA PLANTA (te los da la aplicación; no los ves en la foto):
${bloqueDatos(contexto)}

APARTADOS QUE TIENES QUE ESCRIBIR, EN ESTE ORDEN EXACTO:
${APARTADOS}

REGLAS DE FORMATO:
${REGLAS.trim()}`
}