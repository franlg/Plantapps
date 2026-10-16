import type { PlantContext } from '@/types'
import { LUZ_LABELS } from '@/types'

/** Máximo de eventos de historial que se envían: más que eso solo gasta tokens. */
const MAX_HISTORIAL = 10

/** Opciones de la comparación con la foto anterior. */
export interface OpcionesComparacion {
  /** `true` si la petición lleva también la foto del análisis anterior. */
  tieneFotoAnterior: boolean
  /** Fecha del análisis anterior, si se sabe. Sin ella se dice "hace un tiempo". */
  fechaAnterior?: string | null
}

function esVacio(valor: string | number | null | undefined): boolean {
  return valor === null || valor === undefined || valor === ''
}

/** `- Etiqueta: valor`, o "sin datos" si no hay nada. */
export function dato(etiqueta: string, valor: string | number | null | undefined): string {
  return `- ${etiqueta}: ${esVacio(valor) ? 'sin datos' : valor}`
}

/** Traduce el código de luz a algo legible; si ya viene en texto, lo respeta. */
export function luzEnEspañol(luz: string | undefined): string {
  if (!luz) return 'sin datos'
  return (LUZ_LABELS as Record<string, string>)[luz] ?? luz
}

/** Fecha en texto: 'hace 5 días' ya lo resuelve la app, aquí solo va la fecha. */
export function fecha(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('es-ES') : 'nunca'
}

/**
 * DATOS DE LA PLANTA
 * Te los da la aplicación del usuario. No los ves en la foto: úsalos para decidir
 * si toca regar, que sin ellos es imposible.
 */
function bloqueDatos(contexto: PlantContext): string {
  const riegos = contexto.historial.slice(0, MAX_HISTORIAL).map((h) => `- ${h}`).join('\n')

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
    `- Días desde el último riego: ${contexto.diasDesdeUltimoRiego ?? 'sin datos'}`,
    dato('Frecuencia de riego que el usuario tiene en mente (días)', contexto.frecuenciaRiegoDias),
    esVacio(contexto.notas) ? null : `- Notas del usuario: ${contexto.notas}`,
    '',
    'Historial reciente de la planta:',
    riegos ? riegos : '- sin eventos registrados',
  ]
    .filter((linea): linea is string => linea !== null)
    .join('\n')
}

const PREGUNTAS = `1. ¿Hay que regar ahora? Usa el estado del sustrato que se ve en la foto, el último riego y la frecuencia que maneja el usuario.
2. ¿Cada cuántos días conviene regarla a partir de ahora?
3. ¿Hay que trasplantar? Mira si las raíces asoman por el drenaje, si la planta está ladeada o si la maceta parece pequeña.
4. ¿Se ve algún problema? Describe cuál y cuánto es de grave (ninguna, leve, moderada o grave).
5. ¿Qué signos o síntomas concretos se ven en la foto?
6. ¿Aproximadamente, de qué tamaño es la maceta que se ve en la foto? (puedes responder con un número en centímetros, o "sin datos" si no tienes clara la tamaño. Si no estás seguro, pon "baja" en confianza.)`

const REGLAS = `- Responde ÚNICAMENTE con un objeto JSON válido que cumpla el esquema de la respuesta. Nada de texto antes ni después, ni comentarios.
- Escribe todo en español.
- No inventes datos que no se vean ni en la foto ni en los datos de la planta. Si no lo sabes, no lo afirmes.
- Si la foto no permite decidir (está oscura, borrosa, solo se ve una parte), baja "confianza" a "baja" y explica por qué en "resumen".
- "accionPrincipal": un solo imperativo corto, el más importante. Ejemplo: "Riega en profundidad esta semana". Máximo 160 caracteres, sin emojis.
- "resumen": de 1 a 3 frases en lenguaje sencillo, como si se lo explicaras a alguien que no sabe de plantas. Sin jerga.
- "frecuenciaRiegoDias": número entero de días entre riegos (de 1 a 90) o null si no puedes estimarlo.
- "sintomas": solo lo que se ve, sin interpretar. Si no ves nada, lista vacía.
- "recomendaciones": de 1 a 3 acciones concretas, escritas como órdenes cortas.`

/**
 * Qué tiene que hacer con las dos fotos, o por qué no hay nada que comparar.
 * Sin foto anterior el campo `comparacion` tiene que venir AUSENTE: si el
 * modelo lo inventa, `parsearAnalisis` lo descarta.
 */
function bloqueComparacion({ tieneFotoAnterior, fechaAnterior }: OpcionesComparacion): string {
  if (!tieneFotoAnterior) {
    return 'NO TE PASO NINGUNA FOTO ANTERIOR de esta planta, así que NO hay nada que comparar: deja el campo "comparacion" FUERA de la respuesta. No lo inventes.'
  }

  const cuando = fechaAnterior?.trim() ? `del ${fechaAnterior.trim()}` : 'de hace un tiempo'

  return `TE PASO DOS FOTOS DE LA MISMA PLANTA, en este orden:
1. La PRIMERA imagen es la foto de AHORA, la que tienes que analizar.
2. La SEGUNDA imagen es la foto de un análisis anterior (${cuando}).

COMPARACIÓN, además de responder a lo de siempre:
- Compara las dos fotos una al lado de la otra y di si la planta ha MEJORADO, sigue IGUAL o ha EMPEORADO ("tendencia": "mejor", "igual" o "peor").
- Fíjate en: hojas nuevas que hayan brotado, altura y porte, color (verde más intenso o más amarillo), y manchas o síntomas que aparezcan o desaparezcan.
- Sé HONESTO: si no puedes comparar (la foto está hecha desde otro ángulo, con otra luz, más cerca, o ni siquiera es la misma planta), pon "habiaAnterior": false, "tendencia": "igual" y explica el motivo en "detalle".
- NO INVENTES CAMBIOS: si no ves una diferencia clara entre las dos fotos, "tendencia" es "igual".
- "detalle": una o dos frases en lenguaje sencillo, para alguien que no sabe de plantas. Di QUÉ ha cambiado, no solo que ha cambiado.
- Si has podido comparar, "habiaAnterior" es true.`
}

/**
 * Prompt que se manda junto a la foto de la planta.
 * Todo el texto visible para el modelo está en español; el modelo responde JSON.
 *
 * Con `tieneFotoAnterior` se le avisan de que van dos imágenes y se le pide la
 * comparación; sin ella, el prompt es exactamente el de siempre.
 */
export function construirPrompt(contexto: PlantContext, comparacion?: OpcionesComparacion): string {
  const conComparacion = comparacion?.tieneFotoAnterior === true

  return `Eres un experto en el cuidado de plantas de interior y en el diagnóstico visual a partir de una foto.
Quien te lee no es jardinero: ve la foto de una planta de casa y quiere saber si tiene que hacer algo hoy.

Te pasan ${conComparacion ? 'DOS fotos de la misma planta' : 'una única foto'} y los datos de esa planta.

DATOS DE LA PLANTA (te los da la aplicación; no los ves en la foto):
${bloqueDatos(contexto)}

${bloqueComparacion(comparacion ?? { tieneFotoAnterior: false })}

LO QUE TIENES QUE RESPONDER:
${PREGUNTAS}

REGLAS DE FORMATO:
${REGLAS}`
}