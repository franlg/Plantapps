import { describe, expect, it } from 'vitest'
import { AiError } from '@/types'
import {
  construirPromptIdentificar,
  identificacionResponseSchemaGemini,
  IDENTIFICACION_ESQUEMA,
  MAX_ALTERNATIVAS,
  MOTIVO_SIN_RAZON,
  parsearIdentificacion,
} from './identificar'

const IDENTIFICACION_VALIDA = {
  especie: 'Monstera deliciosa',
  nombreComun: 'Monstera',
  familia: 'Araceae',
  confianza: 'alta',
  razon: 'Hojas grandes con lóbulos y nervaduras marcadas, y un tallo leñoso que se enrosca.',
  alternativas: ['Philodendron scandens', 'Rhaphidophora tetrasperma'],
  frecuenciaRiegoDias: 10,
  luz: 'sol_indirecto',
}

describe('parsearIdentificacion', () => {
  it('devuelve el draft con la especie y los datos de relleno', () => {
    const draft = parsearIdentificacion(JSON.stringify(IDENTIFICACION_VALIDA))

    expect(draft.especie).toBe('Monstera deliciosa')
    expect(draft.nombreComun).toBe('Monstera')
    expect(draft.familia).toBe('Araceae')
    expect(draft.confianza).toBe('alta')
    expect(draft.razon).toContain('lóbulos')
    expect(draft.alternativas).toHaveLength(2)
    expect(draft.frecuenciaRiegoDias).toBe(10)
    expect(draft.luz).toBe('sol_indirecto')
  })

  it('acepta especie null sin lanzar: es una respuesta válida', () => {
    const draft = parsearIdentificacion(
      JSON.stringify({
        especie: null,
        nombreComun: null,
        familia: null,
        confianza: 'baja',
        razon: 'La foto es demasiado oscura para distinguir nada.',
        alternativas: [],
        frecuenciaRiegoDias: null,
        luz: null,
      }),
    )

    expect(draft.especie).toBeNull()
    expect(draft.nombreComun).toBeNull()
    expect(draft.familia).toBeNull()
    expect(draft.confianza).toBe('baja')
    expect(draft.alternativas).toEqual([])
    expect(draft.frecuenciaRiegoDias).toBeNull()
    expect(draft.luz).toBeNull()
  })

  it('trata la especie ausente, vacía o nula como null', () => {
    const { especie: _e, ...resto } = IDENTIFICACION_VALIDA

    expect(parsearIdentificacion(JSON.stringify(resto)).especie).toBeNull()
    expect(parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, especie: null })).especie).toBeNull()
    expect(parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, especie: '   ' })).especie).toBeNull()
  })

  it('baja la confianza a "baja" si el modelo no sabe o no identifica', () => {
    const sinEspecie = { ...IDENTIFICACION_VALIDA, especie: null, confianza: 'alta' }
    expect(parsearIdentificacion(JSON.stringify(sinEspecie)).confianza).toBe('baja')

    const confianzaInventada = { ...IDENTIFICACION_VALIDA, confianza: 'mucha' }
    expect(parsearIdentificacion(JSON.stringify(confianzaInventada)).confianza).toBe('baja')

    const sinConfianza = { ...IDENTIFICACION_VALIDA }
    delete (sinConfianza as Record<string, unknown>).confianza
    expect(parsearIdentificacion(JSON.stringify(sinConfianza)).confianza).toBe('baja')
  })

  it('deja la confianza tal cual cuando sí identifica', () => {
    for (const confianza of ['alta', 'media', 'baja'] as const) {
      const draft = parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, confianza }))
      expect(draft.confianza).toBe(confianza)
    }
  })

  it('acepta la luz como etiqueta en castellano y la guarda como código', () => {
    for (const [entrada, esperado] of [
      ['sol directo', 'sol_directo'],
      ['Sol indirecto', 'sol_indirecto'],
      ['sombra', 'sombra'],
      ['Interior', 'interior'],
    ] as const) {
      expect(parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, luz: entrada })).luz).toBe(esperado)
    }
  })

  it('deja la luz en null si el modelo no da una luz válida', () => {
    for (const luz of ['mucha luz', '', 42, null, undefined]) {
      expect(parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, luz })).luz).toBeNull()
    }
  })

  it('acepta la frecuencia ausente, nula o fuera de rango como null', () => {
    const { frecuenciaRiegoDias: _f, ...resto } = IDENTIFICACION_VALIDA

    expect(parsearIdentificacion(JSON.stringify(resto)).frecuenciaRiegoDias).toBeNull()
    expect(parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, frecuenciaRiegoDias: null })).frecuenciaRiegoDias).toBeNull()
    expect(parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, frecuenciaRiegoDias: 0 })).frecuenciaRiegoDias).toBeNull()
    expect(parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, frecuenciaRiegoDias: 120 })).frecuenciaRiegoDias).toBeNull()
  })

  it('limpia las alternativas: sin repetidas, sin la especie y como mucho tres', () => {
    const alternativas = [
      'Philodendron scandens',
      'philodendron scandens',
      'Monstera deliciosa',
      '  ',
      'Rhaphidophora tetrasperma',
      'Epipremnum aureum',
      'Philodendron gloriosum',
    ]
    const draft = parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, alternativas }))

    expect(draft.alternativas).toEqual([
      'Philodendron scandens',
      'Rhaphidophora tetrasperma',
      'Epipremnum aureum',
    ])
    expect(draft.alternativas).toHaveLength(MAX_ALTERNATIVAS)
    expect(draft.alternativas).not.toContain('Monstera deliciosa')
  })

  it('acepta las alternativas ausentes, nulas o que no son una lista', () => {
    const { alternativas: _a, ...resto } = IDENTIFICACION_VALIDA

    expect(parsearIdentificacion(JSON.stringify(resto)).alternativas).toEqual([])
    expect(parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, alternativas: null })).alternativas).toEqual([])
    expect(parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, alternativas: 'otra cosa' })).alternativas).toEqual([])
  })

  it('pone un motivo honesto si el modelo identifica sin decir por qué', () => {
    expect(parsearIdentificacion(JSON.stringify({ ...IDENTIFICACION_VALIDA, razon: '   ' })).razon).toBe(MOTIVO_SIN_RAZON)

    const sinRazon = { ...IDENTIFICACION_VALIDA }
    delete (sinRazon as Record<string, unknown>).razon
    expect(parsearIdentificacion(JSON.stringify(sinRazon)).razon).toBe(MOTIVO_SIN_RAZON)
  })

  it('acepta el JSON envuelto en un bloque ```json y el objeto ya parseado', () => {
    expect(parsearIdentificacion('```json\n' + JSON.stringify(IDENTIFICACION_VALIDA) + '\n```').especie).toBe(
      'Monstera deliciosa',
    )
    expect(parsearIdentificacion(IDENTIFICACION_VALIDA).especie).toBe('Monstera deliciosa')
  })

  it('lanza respuesta_invalida si la respuesta no es un objeto', () => {
    for (const texto of ['', 'no puedo ayudarte con eso', '[1, 2, 3]', '"texto"']) {
      let error: unknown
      try {
        parsearIdentificacion(texto)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(AiError)
      expect((error as AiError).codigo).toBe('respuesta_invalida')
      expect((error as AiError).message).toBe('La respuesta de la IA no se ha podido interpretar')
    }
  })
})

describe('IDENTIFICACION_ESQUEMA', () => {
  it('acepta la identificación válida y no conserva claves desconocidas', () => {
    const parsed = IDENTIFICACION_ESQUEMA.parse({ ...IDENTIFICACION_VALIDA, campoInventado: 'ignorar' })
    expect('campoInventado' in parsed).toBe(false)
  })
})

describe('identificacionResponseSchemaGemini', () => {
  const esquema = identificacionResponseSchemaGemini() as {
    type: string
    properties: Record<string, Record<string, unknown>>
    required: string[]
  }

  it('es un objeto JSON Schema con descripción en todos los campos', () => {
    expect(esquema.type).toBe('object')

    expect(Object.keys(esquema.properties)).toEqual([
      'especie',
      'nombreComun',
      'familia',
      'confianza',
      'razon',
      'alternativas',
      'frecuenciaRiegoDias',
      'luz',
    ])

    for (const [clave, definicion] of Object.entries(esquema.properties)) {
      expect(typeof definicion.type, `${clave} sin type`).toBe('string')
      expect(typeof definicion.description, `${clave} sin description`).toBe('string')
    }
  })

  it('avisa de que null es una respuesta válida y de bajar la confianza', () => {
    expect(esquema.properties.especie?.nullable).toBe(true)
    expect(esquema.properties.especie?.description).toContain('null')
    expect(esquema.properties.confianza?.format).toBe('enum')
    expect(esquema.properties.confianza?.enum).toEqual(['alta', 'media', 'baja'])
  })

  it('limita las alternativas y declara la luz como enum', () => {
    expect(esquema.properties.alternativas?.maxItems).toBe(MAX_ALTERNATIVAS)
    expect(esquema.properties.alternativas?.items).toEqual({ type: 'string' })
    expect(esquema.properties.luz?.format).toBe('enum')
    expect(esquema.properties.luz?.enum).toEqual(['sol_directo', 'sol_indirecto', 'sombra', 'interior'])
  })

  it('deja fuera de required todo lo que admite null', () => {
    expect(esquema.required).toEqual(['confianza', 'razon', 'alternativas'])
  })

  it('es serializable: el cuerpo de la petición no puede romperse', () => {
    expect(() => JSON.stringify(esquema)).not.toThrow()
  })
})

describe('construirPromptIdentificar', () => {
  it('pide el nombre científico, el común y la familia', () => {
    const prompt = construirPromptIdentificar({ tieneFoto: true })

    expect(prompt).toContain('botánico experto')
    expect(prompt).toContain('¿Qué especie es?')
    expect(prompt).toContain('formato binomial')
    expect(prompt).toContain('¿Cómo se llama en castellano?')
    expect(prompt).toContain('¿A qué familia pertenece?')
  })

  it('acepta que no se pueda decidir y pide bajar la confianza', () => {
    const prompt = construirPromptIdentificar({ tieneFoto: true })

    expect(prompt).toContain('"especie": null')
    expect(prompt).toContain('"confianza": "baja"')
    expect(prompt).toContain('¿Qué tan seguro estás')
  })

  it('pide también la luz y la frecuencia, que la app rellena después', () => {
    const prompt = construirPromptIdentificar({ tieneFoto: true })

    expect(prompt).toContain('¿Cada cuántos días conviene regarla y con qué luz?')
    expect(prompt).toContain('"frecuenciaRiegoDias" y "luz"')
    expect(prompt).toContain('rellenar la ficha')
  })

  it('avisa de que se espera una foto cuando la hay', () => {
    expect(construirPromptIdentificar({ tieneFoto: true })).toContain('Tienes UNA foto')
  })

  it('sin foto le dice al modelo que solo tiene lo que le cuentan', () => {
    const prompt = construirPromptIdentificar({ tieneFoto: false })

    expect(prompt).toContain('NO hay foto')
    expect(prompt).not.toContain('Tienes UNA foto')
  })

  it('mete las pistas del usuario si las hay', () => {
    const prompt = construirPromptIdentificar({ tieneFoto: true, pistas: 'la tengo desde el domingo, es pequeña' })

    expect(prompt).toContain('PISTAS DEL USUARIO')
    expect(prompt).toContain('la tengo desde el domingo, es pequeña')
  })

  it('no mete un bloque de pistas vacío', () => {
    for (const pistas of [undefined, '', '   ']) {
      expect(construirPromptIdentificar({ tieneFoto: true, pistas })).not.toContain('PISTAS DEL USUARIO')
    }
  })
})