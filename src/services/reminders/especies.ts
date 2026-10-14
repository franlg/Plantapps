/**
 * Frecuencias orientativas de riego por especie.
 *
 * Sirven cuando la planta no tiene `frecuenciaRiegoDias` configurado a mano:
 * el usuario escribe `especie: 'Monstera deliciosa'` y la app propone algo
 * razonable en vez del genérico 7 días.
 *
 * Los valores son aproximados y sirven como punto de partida: el sustrato, la
 * maceta, la temperatura y la luz de casa cambian mucho el resultado. Por eso
 * la app siempre deja ganar a lo que el usuario haya escrito.
 */

/** Frecuencia de riego por defecto si no hay especie ni configuración. */
export const FRECUENCIA_POR_DEFECTO = 7

/**
 * Cómo se comporta la planta con el paso de las estaciones.
 * Decide el multiplicador que se aplica a los días de la tabla.
 */
type Grupo =
  /** Plural hojas, tropical de interior: sigue viva todo el año. */
  | 'interior'
  /** Huerto, balcón o jardín: se para de crecer cuando hiela. */
  | 'exterior'
  /** Almacena agua: pasarse de riego es el error más caro. */
  | 'suculenta'
  | 'cactus'
  /** Bambú: hierba muy sedienta en verano, en reposo en invierno. */
  | 'bambu'

interface EntradaEspecie {
  /** Nombres con los que puede venir escrita la especie (se comparan normalizados). */
  alias: string[]
  /** Días entre riegos en pleno desarrollo, sin ajuste estacional. */
  dias: number
  grupo: Grupo
}

/**
 * Tabla. El orden no importa: se indexa por alias en el orden de la longest.
 * Los alias pueden llevar acentos, los quito al comparar.
 */
const TABLA_ESPECIES: readonly EntradaEspecie[] = [
  // --- Interior ---------------------------------------------------------
  { alias: ['Monstera', 'Monstera deliciosa'], dias: 10, grupo: 'interior' },
  { alias: ['Philodendron'], dias: 9, grupo: 'interior' },
  { alias: ['Ficus'], dias: 9, grupo: 'interior' },
  { alias: ['Ficus lyrata', 'Fiddle leaf fig'], dias: 8, grupo: 'interior' },
  { alias: ['Ficus elastica', 'Caucho'], dias: 12, grupo: 'interior' },
  { alias: ['Ficus benjamina'], dias: 8, grupo: 'interior' },
  { alias: ['Poto', 'Epipremnum', 'Pothos', 'Golden pothos'], dias: 9, grupo: 'interior' },
  { alias: ['Helecho'], dias: 5, grupo: 'interior' },
  { alias: ['Nephrolepis', 'Helecho de Boston'], dias: 5, grupo: 'interior' },
  { alias: ['Musgo', 'Moss'], dias: 2, grupo: 'interior' },
  { alias: ['Calathea'], dias: 6, grupo: 'interior' },
  { alias: ['Maranta'], dias: 6, grupo: 'interior' },
  { alias: ['Orquídea', 'Phalaenopsis'], dias: 9, grupo: 'interior' },
  { alias: ['Spathiphyllum', 'Lirio de paz', 'Peace lily'], dias: 6, grupo: 'interior' },
  { alias: ['Anthurium', 'Anturio'], dias: 7, grupo: 'interior' },
  { alias: ['Dieffenbachia', 'Amoena'], dias: 9, grupo: 'interior' },
  { alias: ['Strelitzia', 'Ave del paraíso', 'Bird of paradise'], dias: 8, grupo: 'interior' },
  { alias: ['Palmera', 'Kentia', 'Chamaedorea', 'Phoenix'], dias: 10, grupo: 'interior' },
  { alias: ['Drácena', 'Dracaena'], dias: 12, grupo: 'interior' },
  { alias: ['Hoya', 'Hoya de cera'], dias: 12, grupo: 'interior' },
  { alias: ['Pilea'], dias: 8, grupo: 'interior' },
  { alias: ['Tradescantia'], dias: 6, grupo: 'interior' },
  { alias: ['Begonia'], dias: 4, grupo: 'interior' },
  { alias: ['Clivia'], dias: 10, grupo: 'interior' },
  { alias: ['Azalea'], dias: 6, grupo: 'interior' },
  { alias: ['Ciclamen'], dias: 10, grupo: 'interior' },
  { alias: ['Violeta africana'], dias: 8, grupo: 'interior' },

  // --- Suculentas y cactus ----------------------------------------------
  { alias: ['Aloe vera'], dias: 15, grupo: 'suculenta' },
  { alias: ['Aloe'], dias: 18, grupo: 'suculenta' },
  { alias: ['Haworthia'], dias: 21, grupo: 'suculenta' },
  { alias: ['Sansevieria', 'Snake plant', 'Dracaena trifasciata'], dias: 18, grupo: 'suculenta' },
  { alias: ['Kalanchoe'], dias: 18, grupo: 'suculenta' },
  { alias: ['Echeveria'], dias: 18, grupo: 'suculenta' },
  { alias: ['Sedum'], dias: 18, grupo: 'suculenta' },
  { alias: ['Crassula', 'Árbol del dinero'], dias: 21, grupo: 'suculenta' },
  { alias: ['Schlumbergera', 'Cactus de Navidad'], dias: 14, grupo: 'suculenta' },
  { alias: ['Suculenta', 'Suculentas'], dias: 21, grupo: 'suculenta' },
  { alias: ['Cactus'], dias: 25, grupo: 'cactus' },
  { alias: ['Opuntia', 'Nopal'], dias: 30, grupo: 'cactus' },

  // --- Bambú -------------------------------------------------------------
  { alias: ['Bambú', 'Bambusa'], dias: 3, grupo: 'bambu' },

  // --- Exterior: huerto, balcón y jardín ---------------------------------
  { alias: ['Tomate', 'Tomatera'], dias: 2, grupo: 'exterior' },
  { alias: ['Lechuga'], dias: 2, grupo: 'exterior' },
  { alias: ['Albahaca', 'Basilico', 'Ocimum'], dias: 2, grupo: 'exterior' },
  { alias: ['Hierbabuena', 'Menta piperita'], dias: 2, grupo: 'exterior' },
  { alias: ['Menta'], dias: 3, grupo: 'exterior' },
  { alias: ['Salvia'], dias: 4, grupo: 'exterior' },
  { alias: ['Fresa', 'Fresal', 'Strawberry'], dias: 3, grupo: 'exterior' },
  { alias: ['Pimiento', 'Pimienta', 'Chile', 'Chilli'], dias: 3, grupo: 'exterior' },
  { alias: ['Geranio', 'Pelargonio'], dias: 3, grupo: 'exterior' },
  { alias: ['Hortensia'], dias: 3, grupo: 'exterior' },
  { alias: ['Petunia'], dias: 4, grupo: 'exterior' },
  { alias: ['Girasol', 'Helianthus'], dias: 4, grupo: 'exterior' },
  { alias: ['Rosa'], dias: 5, grupo: 'exterior' },
  { alias: ['Jazmín'], dias: 6, grupo: 'exterior' },
  { alias: ['Bougainvillea', 'Buganvilla'], dias: 8, grupo: 'exterior' },
  { alias: ['Cítrico', 'Limón', 'Limonero', 'Naranjo', 'Mandarino', 'Citrus'], dias: 8, grupo: 'exterior' },
  { alias: ['Lavanda', 'Lavandula'], dias: 10, grupo: 'exterior' },
  { alias: ['Romero', 'Rosmarinus'], dias: 14, grupo: 'exterior' },
  { alias: ['Olivo', 'Olivera'], dias: 20, grupo: 'exterior' },
  { alias: ['Ciprés', 'Cupressus'], dias: 12, grupo: 'exterior' },
]

/**
 * Deja el texto comparable: sin acentos, en minúsculas y sin sobrar espacios.
 * Así `'Monstera  DELICIOSA '`, `'monstera deliciosa'` y `'MÓNSTERA DELICIOSA'`
 * caen en la misma fila de la tabla.
 */
export function normalizarEspecie(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface IndiceEspecie {
  /** Longitud del alias normalizado: el más largo gana, para ir a lo específico. */
  longitud: number
  /** Coincide por palabras enteras, no por trozos ('rosa' no casa con 'aromas'). */
  patron: RegExp
  dias: number
  grupo: Grupo
}

/** Alias indexados y ordenados de más largo a más corto. */
const INDICE: readonly IndiceEspecie[] = TABLA_ESPECIES.flatMap((entrada) =>
  entrada.alias.map((alias) => {
    const limpio = normalizarEspecie(alias)
    return {
      longitud: limpio.length,
      patron: new RegExp(`(^| )${limpio}($| )`),
      dias: entrada.dias,
      grupo: entrada.grupo,
    }
  }),
).sort((a, b) => b.longitud - a.longitud)

function enInvierno(mes: number): boolean {
  return mes === 12 || mes <= 2
}

function enVerano(mes: number): boolean {
  return mes >= 6 && mes <= 8
}

/**
 * Multiplicador sobre el intervalo en días.
 * >1 = regar menos veces; <1 = regar más veces.
 */
function factorEstacional(grupo: Grupo, mes: number): number {
  switch (grupo) {
    case 'suculenta':
    case 'cactus':
      // Sin ajuste: la tabla ya es un calendario conservador de todo el año.
      // Con estas plantas el error caro es el agua de más, no la de menos.
      return 1
    case 'bambu':
      // En invierno el bambú de exterior está en reposo; en verano bebe muchísimo.
      return enInvierno(mes) ? 2 : enVerano(mes) ? 0.7 : 1
    case 'exterior':
      // Invernada: deja de crecer casi del todo, así que se riega la mitad de veces.
      return enInvierno(mes) ? 2 : 1
    case 'interior':
      // Con luz artificial no se hiberna: los meses solo mueven el intervalo un ±20 %.
      return enInvierno(mes) ? 1.2 : enVerano(mes) ? 0.8 : 1
  }
}

function normalizarMes(mes: number | undefined): number | null {
  if (mes == null || !Number.isFinite(mes)) return null
  const entero = Math.trunc(mes)
  return entero >= 1 && entero <= 12 ? entero : null
}

function aDias(valor: number): number {
  return Math.max(1, Math.round(valor))
}

/**
 * Días entre riegos sugeridos para una especie.
 *
 * @param especie Nombre de la especie, en cualquier capitalización y con
 *   acentos o sin ellos: "Ficus lyrata", "FICUS LYRATA" o "ficus lyrata" dan lo mismo.
 * @param mes Mes del año (1-12) para ajustar por estación. Si se omite (o es
 *   inválido) se devuelve el valor base de la tabla, sin ajuste.
 * @returns Días entre riegos (siempre entero >= 1), `FRECUENCIA_POR_DEFECTO`
 *   si la especie no está en la tabla, o `null` si la planta no dice cuál es.
 */
export function frecuenciaSugerida(especie: string | undefined, mes?: number): number | null {
  const texto = normalizarEspecie(especie ?? '')
  if (texto.length === 0) return null

  // `INDICE` está ordenado de alias más largo a más corto, así que el primer
  // acierto es el más específico: "ficus lyrata" gana a "ficus".
  const entrada = INDICE.find((c) => c.patron.test(texto))
  if (!entrada) return FRECUENCIA_POR_DEFECTO

  const momento = normalizarMes(mes)
  return momento == null ? aDias(entrada.dias) : aDias(entrada.dias * factorEstacional(entrada.grupo, momento))
}