import { describe, expect, it } from 'vitest'
import { AiError } from '@/types'
import {
  construirPromptGuia,
  CONTENIDO_POR_DEFECTO,
  GUIA_ESQUEMA,
  guiaResponseSchemaGemini,
  parsearGuia,
  TITULOS_GUIA,
} from './guia'
import type { GuiaInput } from '@/types'

const CONTEXTO: GuiaInput['contexto'] = {
  nombre: 'Monstera del salón',
  especie: 'Monstera deliciosa',
  maceta: 'maceta de 18 cm',
  ubicacion: 'sala, junto a la ventana',
  luz: 'sol_indirecto',
  diasDesdePlantado: 120,
  ultimoRiego: '2026-10-01T10:00:00.000Z',
}

const SECCIONES = [
  { titulo: 'Riego', contenido: 'Riega cuando los primeros centímetros se sequen.', puntos: ['Nada de calendarios fijos'] },
  { titulo: 'Luz', contenido: 'Luz indirecta brillante, nunca sol directo.' },
  { titulo: 'Sustrato y maceta', contenido: 'Sustrato universal con perlita y maceta con drenaje.' },
  { titulo: 'Temperatura', contenido: 'Entre 18 y 27 °C, sin corrientes de aire.' },
  { titulo: 'Fertilización', contenido: 'Cada dos meses en primavera y verano.' },
  { titulo: 'Problemas frecuentes', contenido: 'Hojas amarillas en la base: suele ser exceso de agua.' },
]

const GUIA_VALIDA = {
  nombreComun: 'Monstera',
  nombreCientifico: 'Monstera deliciosa',
  familia: 'Araceae',
  resumen: 'Planta de casa muy resistente. Le gusta la luz indirecta y la tierra siempre algo húmeda.',
  secciones: SECCIONES,
  frecuenciaRiegoDias: 10,
  dificultad: 'facil',
  basadaEnContexto: true,
}

describe('parsearGuia', () => {
  it('devuelve el draft con las seis secciones', () => {
    const draft = parsearGuia(JSON.stringify(GUIA_VALIDA))

    expect(draft.nombreComun).toBe('Monstera')
    expect(draft.nombreCientifico).toBe('Monstera deliciosa')
    expect(draft.familia).toBe('Araceae')
    expect(draft.resumen).toContain('resistente')
    expect(draft.secciones).toHaveLength(6)
    expect(draft.secciones.map((s) => s.titulo)).toEqual([...TITULOS_GUIA])
    expect(draft.secciones[0]?.puntos).toEqual(['Nada de calendarios fijos'])
    expect(draft.secciones[1]?.puntos).toBeUndefined()
    expect(draft.frecuenciaRiegoDias).toBe(10)
    expect(draft.dificultad).toBe('facil')
    expect(draft.basadaEnContexto).toBe(true)
  })

  it('rellena los apartados que falten en vez de fallar', () => {
    const draft = parsearGuia(
      JSON.stringify({ ...GUIA_VALIDA, secciones: [{ titulo: 'Riego', contenido: 'Cuando la tierra se seque.' }] }),
    )

    expect(draft.secciones).toHaveLength(6)
    expect(draft.secciones[0]?.titulo).toBe('Riego')
    expect(draft.secciones[0]?.contenido).toBe('Cuando la tierra se seque.')

    expect(draft.secciones[1]?.titulo).toBe('Luz')
    expect(draft.secciones[1]?.contenido).toBe(CONTENIDO_POR_DEFECTO)
    expect(draft.secciones[5]?.contenido).toBe(CONTENIDO_POR_DEFECTO)
  })

  it('rellena el contenido de un apartado que viene en blanco', () => {
    const secciones = SECCIONES.map((s, i) => (i === 2 ? { ...s, contenido: '   ' } : s))
    const draft = parsearGuia(JSON.stringify({ ...GUIA_VALIDA, secciones }))

    expect(draft.secciones[2]?.contenido).toBe(CONTENIDO_POR_DEFECTO)
  })

  it('rellena las seis cuando el modelo no devuelve ninguna sección', () => {
    for (const secciones of [[], 'no es una lista', null, undefined]) {
      const draft = parsearGuia(JSON.stringify({ ...GUIA_VALIDA, secciones }))
      expect(draft.secciones).toHaveLength(6)
      expect(draft.secciones.every((s) => s.contenido === CONTENIDO_POR_DEFECTO)).toBe(true)
    }
  })

  it('coloca cada apartado en su sitio aunque el modelo los mande desordenados', () => {
    const desordenadas = [SECCIONES[4], SECCIONES[0], SECCIONES[2], SECCIONES[1], SECCIONES[5], SECCIONES[3]]
    const draft = parsearGuia(JSON.stringify({ ...GUIA_VALIDA, secciones: desordenadas }))

    expect(draft.secciones.map((s) => s.titulo)).toEqual([...TITULOS_GUIA])
    expect(draft.secciones[0]?.contenido).toBe(SECCIONES[0]?.contenido)
    expect(draft.secciones[4]?.contenido).toBe(SECCIONES[4]?.contenido)
  })

  it('reconoce los títulos aunque el modelo los escriba con otras palabras', () => {
    const conOtherPalabras = [
      { titulo: 'AGUA Y RIEGO', contenido: 'Cada diez días más o menos.' },
      { titulo: 'Iluminación', contenido: 'Media sombra.' },
      { titulo: 'Tierra y maceta', contenido: 'Con perlita.' },
      { titulo: 'Clima', contenido: 'Sin frío.' },
      { titulo: 'Fertilización', contenido: 'Cada dos meses.' },
      { titulo: 'Plagas', contenido: 'Cochinillas.' },
    ]
    const draft = parsearGuia(JSON.stringify({ ...GUIA_VALIDA, secciones: conOtherPalabras }))

    // Cada apartado cae en su hueco, y el título del modelo se conserva porque
    // suele ser más concreto que el nuestro ("Iluminación", "Clima").
    expect(draft.secciones.map((s) => s.contenido)).toEqual([
      'Cada diez días más o menos.',
      'Media sombra.',
      'Con perlita.',
      'Sin frío.',
      'Cada dos meses.',
      'Cochinillas.',
    ])
    expect(draft.secciones.map((s) => s.titulo)).toEqual([
      'AGUA Y RIEGO',
      'Iluminación',
      'Tierra y maceta',
      'Clima',
      'Fertilización',
      'Plagas',
    ])
  })

  it('filtra los apartados que no encajan en ninguno de los seis', () => {
    const secciones = [...SECCIONES, { titulo: 'Curiosidades', contenido: 'Es la más popular del mundo.' }]
    const draft = parsearGuia(JSON.stringify({ ...GUIA_VALIDA, secciones }))

    expect(draft.secciones).toHaveLength(6)
    expect(draft.secciones.map((s) => s.titulo)).not.toContain('Curiosidades')
  })

  it('acepta el JSON envuelto en un bloque ```json', () => {
    const texto = 'Aquí tienes la guía:\n```json\n' + JSON.stringify(GUIA_VALIDA) + '\n```\nEspero que sirva.'
    expect(parsearGuia(texto).nombreComun).toBe('Monstera')
  })

  it('acepta un objeto ya parseado', () => {
    expect(parsearGuia(GUIA_VALIDA).familia).toBe('Araceae')
  })

  it('acepta una frecuencia ausente, nula o fuera de rango como null', () => {
    const { frecuenciaRiegoDias: _f, ...resto } = GUIA_VALIDA

    expect(parsearGuia(JSON.stringify(resto)).frecuenciaRiegoDias).toBeNull()
    expect(parsearGuia(JSON.stringify({ ...resto, frecuenciaRiegoDias: null })).frecuenciaRiegoDias).toBeNull()
    expect(parsearGuia(JSON.stringify({ ...GUIA_VALIDA, frecuenciaRiegoDias: 0 })).frecuenciaRiegoDias).toBeNull()
    expect(parsearGuia(JSON.stringify({ ...GUIA_VALIDA, frecuenciaRiegoDias: 91 })).frecuenciaRiegoDias).toBeNull()
    expect(parsearGuia(JSON.stringify({ ...GUIA_VALIDA, frecuenciaRiegoDias: 8.5 })).frecuenciaRiegoDias).toBeNull()
  })

  it('no se rompe con textos vacíos ni con una dificultad inventada', () => {
    const draft = parsearGuia(
      JSON.stringify({ ...GUIA_VALIDA, nombreComun: '  ', nombreCientifico: '', familia: null, resumen: '   ', dificultad: 'imposible' }),
    )

    expect(draft.nombreComun).toBe('Planta sin nombre')
    expect(draft.nombreCientifico).toBe('Sin determinar')
    expect(draft.familia).toBe('Desconocida')
    expect(draft.resumen).not.toBe('')
    expect(draft.dificultad).toBe('media')
  })

  it('da por hecho que una guía se apoya en los datos de la planta', () => {
    const { basadaEnContexto: _b, ...resto } = GUIA_VALIDA
    expect(parsearGuia(JSON.stringify(resto)).basadaEnContexto).toBe(true)
    expect(parsearGuia(JSON.stringify({ ...GUIA_VALIDA, basadaEnContexto: false })).basadaEnContexto).toBe(false)
  })

  it('descarta los puntos que no son texto', () => {
    const crudos = ['deja secar la tierra', 42, null, '   ', 'mueve a media sombra']
    const secciones = [{ ...SECCIONES[0], puntos: crudos }, ...SECCIONES.slice(1)]
    const draft = parsearGuia(JSON.stringify({ ...GUIA_VALIDA, secciones }))

    expect(draft.secciones[0]?.puntos).toEqual(['deja secar la tierra', 'mueve a media sombra'])
  })

  it('lanza respuesta_invalida si la respuesta no es un objeto', () => {
    for (const texto of ['', 'no puedo ayudarte con eso', '[1, 2, 3]', '"texto"']) {
      let error: unknown
      try {
        parsearGuia(texto)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(AiError)
      expect((error as AiError).codigo).toBe('respuesta_invalida')
      expect((error as AiError).message).toBe('La respuesta de la IA no se ha podido interpretar')
    }
  })
})

describe('GUIA_ESQUEMA', () => {
  it('acepta la guía válida y no conserva claves desconocidas', () => {
    const parsed = GUIA_ESQUEMA.parse({ ...GUIA_VALIDA, campoInventado: 'ignorar' })
    expect('campoInventado' in parsed).toBe(false)
  })
})

describe('guiaResponseSchemaGemini', () => {
  const esquema = guiaResponseSchemaGemini() as {
    type: string
    properties: Record<string, Record<string, unknown>>
    required: string[]
  }

  it('es un objeto JSON Schema con descripción en todos los campos', () => {
    expect(esquema.type).toBe('object')

    expect(Object.keys(esquema.properties)).toEqual([
      'nombreComun',
      'nombreCientifico',
      'familia',
      'resumen',
      'secciones',
      'frecuenciaRiegoDias',
      'dificultad',
      'basadaEnContexto',
    ])

    for (const [clave, definicion] of Object.entries(esquema.properties)) {
      expect(typeof definicion.type, `${clave} sin type`).toBe('string')
      expect(typeof definicion.description, `${clave} sin description`).toBe('string')
    }
  })

  it('describe los tres campos de cada apartado de las secciones', () => {
    const secciones = esquema.properties.secciones as { items: { properties: Record<string, Record<string, unknown>> } }
    const apartados = secciones.items.properties

    expect(Object.keys(apartados)).toEqual(['titulo', 'contenido', 'puntos'])
    for (const [clave, definicion] of Object.entries(apartados)) {
      expect(typeof definicion.type, `${clave} sin type`).toBe('string')
      expect(typeof definicion.description, `${clave} sin description`).toBe('string')
    }
    expect((apartados.puntos as { items: unknown }).items).toEqual({ type: 'string' })
  })

  it('marca el enum de dificultad y el nullable de la frecuencia', () => {
    expect(esquema.properties.dificultad?.format).toBe('enum')
    expect(esquema.properties.dificultad?.enum).toEqual(['facil', 'media', 'avanzada'])
    expect(esquema.properties.frecuenciaRiegoDias?.nullable).toBe(true)
  })

  it('deja fuera de required lo que admite null', () => {
    expect(esquema.required).not.toContain('frecuenciaRiegoDias')
    expect(esquema.required).toEqual(
      Object.keys(esquema.properties).filter((clave) => clave !== 'frecuenciaRiegoDias'),
    )
  })

  it('es serializable: el cuerpo de la petición no puede romperse', () => {
    expect(() => JSON.stringify(esquema)).not.toThrow()
  })
})

describe('construirPromptGuia', () => {
  it('pone el papel de experto y avisa de que el usuario no es experto', () => {
    const prompt = construirPromptGuia(CONTEXTO)

    expect(prompt).toContain('experto en el cuidado de plantas de interior')
    expect(prompt).toContain('sin conocimientos de botánica')
  })

  it('incluye todos los datos de la planta', () => {
    const prompt = construirPromptGuia(CONTEXTO)

    expect(prompt).toContain('Monstera del salón')
    expect(prompt).toContain('Monstera deliciosa')
    expect(prompt).toContain('120')
    expect(prompt).toContain('maceta de 18 cm')
    expect(prompt).toContain('sala, junto a la ventana')
    expect(prompt).toContain('Sol indirecto')
    expect(prompt).toContain('Último riego: 1/10/2026')
  })

  it('pide los seis apartados siempre y en este orden', () => {
    const prompt = construirPromptGuia(CONTEXTO)

    // Solo importa el orden de la lista de apartados, no el del bloque de datos.
    const lista = prompt.split('APARTADOS QUE TIENES QUE ESCRIBIR')[1] ?? ''
    const orden = TITULOS_GUIA.map((titulo) => lista.indexOf(titulo))

    expect(orden.every((posicion) => posicion !== -1)).toBe(true)
    expect([...orden].sort((a, b) => a - b)).toEqual(orden)
    expect(prompt).toContain('EN ESTE ORDEN EXACTO')
  })

  it('pide JSON puro, en español y sin inventar', () => {
    const prompt = construirPromptGuia(CONTEXTO)

    expect(prompt).toContain('Responde ÚNICAMENTE con un objeto JSON válido')
    expect(prompt).toContain('en español')
    expect(prompt).toContain('No inventes datos')
    expect(prompt).toContain('EXACTAMENTE 6 apartados')
  })

  it('no rompe con una planta sin datos', () => {
    const prompt = construirPromptGuia({
      nombre: 'Planta sin nombre',
      diasDesdePlantado: null,
      ultimoRiego: null,
    })

    expect(prompt).toContain('Planta sin nombre')
    expect(prompt).toContain('nunca se ha regado')
    expect(prompt).toContain('sin datos')

    // El bloque de datos no puede llevar null ni undefined: se verían como ruido.
    const datos = prompt.split('APARTADOS QUE TIENES QUE ESCRIBIR')[0] ?? ''
    expect(datos).not.toContain('undefined')
    expect(datos).not.toContain('null')
  })
})