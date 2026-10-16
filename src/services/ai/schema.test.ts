import { describe, expect, it } from 'vitest'
import { AiError } from '@/types'
import { desenvolverJson, ESQUEMA_ANALISIS, ESQUEMA_COMPARACION, parsearAnalisis, responseSchemaGemini } from './schema'

const ANALISIS_VALIDO = {
  veredicto: 'regar',
  salud: 78,
  accionPrincipal: 'Riega en profundidad esta semana',
  regar: true,
  frecuenciaRiegoDias: 7,
  problema: 'Tierra muy seca',
  gravedad: 'leve',
  sintomas: ['tierra agrietada en la superficie', 'hojas ligeramente caídas'],
  recomendaciones: ['Riega hasta que salga agua por el drenaje'],
  confianza: 'alta',
  resumen: 'La planta tiene sed. Riégala bien y se recuperará.',
}

describe('parsearAnalisis', () => {
  it('devuelve el draft con los valores que envía el modelo', () => {
    const draft = parsearAnalisis(JSON.stringify(ANALISIS_VALIDO))

    expect(draft.veredicto).toBe('regar')
    expect(draft.salud).toBe(78)
    expect(draft.accionPrincipal).toBe('Riega en profundidad esta semana')
    expect(draft.regar).toBe(true)
    expect(draft.frecuenciaRiegoDias).toBe(7)
    expect(draft.gravedad).toBe('leve')
    expect(draft.sintomas).toHaveLength(2)
    expect(draft.confianza).toBe('alta')
  })

  it('acepta el JSON envuelto en un bloque ```json', () => {
    const texto = '```json\n' + JSON.stringify(ANALISIS_VALIDO) + '\n```'
    expect(parsearAnalisis(texto).accionPrincipal).toBe(ANALISIS_VALIDO.accionPrincipal)
  })

  it('acepta el bloque ``` sin etiqueta y con texto alrededor', () => {
    const texto = 'Aquí tienes el análisis:\n```\n' + JSON.stringify(ANALISIS_VALIDO) + '\n```\nEspero que sirva.'
    expect(parsearAnalisis(texto).veredicto).toBe('regar')
  })

  it('acepta un objeto ya parseado', () => {
    expect(parsearAnalisis(ANALISIS_VALIDO).salud).toBe(78)
  })

  it('acepta problema y gravedad ausentes, nulos o vacíos', () => {
    const { problema: _p, gravedad: _g, ...resto } = ANALISIS_VALIDO
    const draft = parsearAnalisis(JSON.stringify(resto))
    expect(draft.problema).toBeUndefined()
    expect(draft.gravedad).toBeUndefined()

    const conNulos = parsearAnalisis(JSON.stringify({ ...resto, problema: null, gravedad: null }))
    expect(conNulos.problema).toBeUndefined()
    expect(conNulos.gravedad).toBeUndefined()

    const conVacio = parsearAnalisis(JSON.stringify({ ...resto, problema: '   ' }))
    expect(conVacio.problema).toBeUndefined()
  })

  it('trata frecuenciaRiegoDias ausente como null', () => {
    const { frecuenciaRiegoDias: _f, ...resto } = ANALISIS_VALIDO
    expect(parsearAnalisis(JSON.stringify(resto)).frecuenciaRiegoDias).toBeNull()
  })

  it('rechaza JSON que no cumple el esquema', () => {
    const casos: Record<string, unknown>[] = [
      { ...ANALISIS_VALIDO, salud: 150 },
      { ...ANALISIS_VALIDO, salud: 85.5 },
      { ...ANALISIS_VALIDO, veredicto: 'regar_mucho' },
      { ...ANALISIS_VALIDO, accionPrincipal: 'x'.repeat(161) },
      { ...ANALISIS_VALIDO, accionPrincipal: '   ' },
      { ...ANALISIS_VALIDO, frecuenciaRiegoDias: 0 },
      { ...ANALISIS_VALIDO, frecuenciaRiegoDias: 91 },
      { ...ANALISIS_VALIDO, regar: 'sí' },
      { ...ANALISIS_VALIDO, gravedad: 'critica' },
      { ...ANALISIS_VALIDO, confianza: 'mucha' },
      { ...ANALISIS_VALIDO, sintomas: 'hojas amarillas' },
      { ...ANALISIS_VALIDO, recomendaciones: 'mover a media sombra' },
      { ...ANALISIS_VALIDO, resumen: '' },
    ]

    for (const caso of casos) {
      expect(() => parsearAnalisis(JSON.stringify(caso))).toThrowError(AiError)
    }
  })

  it('lanza respuesta_invalida si la respuesta no es JSON', () => {
    for (const texto of ['', 'no puedo ayudarte con eso', '[1, 2, 3]', '"texto"']) {
      let error: unknown
      try {
        parsearAnalisis(texto)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(AiError)
      expect((error as AiError).codigo).toBe('respuesta_invalida')
      expect((error as AiError).message).toBe('La respuesta de la IA no se ha podido interpretar')
    }
  })
})

describe('parsearAnalisis con comparacion', () => {
  const COMPARACION = {
    tendencia: 'mejor',
    detalle: 'Ha brotado una hoja nueva y el verde es más intenso.',
    habiaAnterior: true,
  }

  it('guarda la comparación cuando viene completa y válida', () => {
    const draft = parsearAnalisis(JSON.stringify({ ...ANALISIS_VALIDO, comparacion: COMPARACION }))

    expect(draft.comparacion).toEqual(COMPARACION)
  })

  it('acepta las tres tendencias', () => {
    for (const tendencia of ['mejor', 'igual', 'peor'] as const) {
      const draft = parsearAnalisis(JSON.stringify({ ...ANALISIS_VALIDO, comparacion: { ...COMPARACION, tendencia } }))
      expect(draft.comparacion?.tendencia).toBe(tendencia)
    }
  })

  it('no falla cuando no viene comparación: la mayoría de los análisis no comparan', () => {
    const draft = parsearAnalisis(JSON.stringify(ANALISIS_VALIDO))
    expect(draft.comparacion).toBeUndefined()
  })

  it('descarta una comparación nula o vacía', () => {
    expect(parsearAnalisis(JSON.stringify({ ...ANALISIS_VALIDO, comparacion: null })).comparacion).toBeUndefined()
    expect(parsearAnalisis(JSON.stringify({ ...ANALISIS_VALIDO, comparacion: {} })).comparacion).toBeUndefined()
    expect(parsearAnalisis(JSON.stringify({ ...ANALISIS_VALIDO, comparacion: 'ha mejorado' })).comparacion).toBeUndefined()
  })

  it('descarta la comparación si la tendencia no es una de las tres, sin perder el análisis', () => {
    const draft = parsearAnalisis(
      JSON.stringify({ ...ANALISIS_VALIDO, comparacion: { ...COMPARACION, tendencia: 'mejoradisima' } }),
    )

    expect(draft.comparacion).toBeUndefined()
    expect(draft.veredicto).toBe(ANALISIS_VALIDO.veredicto)
    expect(draft.salud).toBe(ANALISIS_VALIDO.salud)
  })

  it('descarta la comparación si el detalle está vacío', () => {
    const draft = parsearAnalisis(JSON.stringify({ ...ANALISIS_VALIDO, comparacion: { ...COMPARACION, detalle: '   ' } }))
    expect(draft.comparacion).toBeUndefined()
  })

  it('descarta la comparación si habiaAnterior es false, aunque la tendencia sea "igual"', () => {
    // Sin foto anterior no se puede afirmar nada: la app ya sabía que no la
    // había mandado, así que la comparación no aporta nada.
    const draft = parsearAnalisis(
      JSON.stringify({ ...ANALISIS_VALIDO, comparacion: { tendencia: 'igual', detalle: 'No he podido comparar.', habiaAnterior: false } }),
    )

    expect(draft.comparacion).toBeUndefined()
    expect(draft.resumen).toBe(ANALISIS_VALIDO.resumen)
  })

  it('descarta la comparación inventada con habiaAnterior false y tendencia "mejor"', () => {
    const draft = parsearAnalisis(
      JSON.stringify({ ...ANALISIS_VALIDO, comparacion: { ...COMPARACION, habiaAnterior: false } }),
    )

    expect(draft.comparacion).toBeUndefined()
    expect(draft).toMatchObject({ veredicto: ANALISIS_VALIDO.veredicto, salud: ANALISIS_VALIDO.salud })
  })

  it('no deja pasar una comparación con campos que faltan o del tipo equivocado', () => {
    for (const comparacion of [
      { tendencia: 'mejor', habiaAnterior: true },
      { tendencia: 'mejor', detalle: 'Algo ha cambiado.' },
      { detalle: 'Algo ha cambiado.', habiaAnterior: true },
      { ...COMPARACION, habiaAnterior: 'sí' },
      { ...COMPARACION, detalle: 7 },
    ]) {
      const draft = parsearAnalisis(JSON.stringify({ ...ANALISIS_VALIDO, comparacion }))
      expect(draft.comparacion).toBeUndefined()
      expect(draft.veredicto).toBe(ANALISIS_VALIDO.veredicto)
    }
  })

  it('el esquema por sí solo rechaza una tendencia distinta de "igual" sin foto anterior', () => {
    const sinFotoAnterior = ESQUEMA_COMPARACION.safeParse({
      tendencia: 'mejor',
      detalle: 'Ha mejorado muchísimo.',
      habiaAnterior: false,
    })
    expect(sinFotoAnterior.success).toBe(false)

    const igualSinFotoAnterior = ESQUEMA_COMPARACION.safeParse({
      tendencia: 'igual',
      detalle: 'No he podido comparar: otra luz.',
      habiaAnterior: false,
    })
    expect(igualSinFotoAnterior.success).toBe(true)
  })
})

describe('desenvolverJson', () => {
  it('recorta el bloque ```json', () => {
    expect(desenvolverJson('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('recorta el bloque ``` pelado', () => {
    expect(desenvolverJson('```\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('recorta el texto que sobra alrededor', () => {
    expect(desenvolverJson('texto antes {"a":1} texto después')).toBe('{"a":1}')
  })
})

describe('ESQUEMA_ANALISIS', () => {
  it('acepta el análisis válido y no añade claves desconocidas', () => {
    const parsed = ESQUEMA_ANALISIS.parse({ ...ANALISIS_VALIDO, campoInventado: 'ignorar' })
    expect('campoInventado' in parsed).toBe(false)
  })
})

describe('responseSchemaGemini', () => {
  const esquema = responseSchemaGemini() as {
    type: string
    properties: Record<string, Record<string, unknown>>
    required: string[]
  }

  it('es un objeto JSON Schema con descripción en todos los campos', () => {
    expect(esquema.type).toBe('object')

    expect(Object.keys(esquema.properties)).toEqual([
      'veredicto',
      'salud',
      'accionPrincipal',
      'regar',
      'frecuenciaRiegoDias',
      'maceta',
      'problema',
      'gravedad',
      'sintomas',
      'recomendaciones',
      'confianza',
      'resumen',
      'comparacion',
    ])

    for (const [clave, definicion] of Object.entries(esquema.properties)) {
      expect(typeof definicion.type, `${clave} sin type`).toBe('string')
      expect(typeof definicion.description, `${clave} sin description`).toBe('string')
    }
  })

  it('marca los enums con format enum, los arrays con items y el nullable', () => {
    expect(esquema.properties.veredicto?.format).toBe('enum')
    expect(esquema.properties.confianza?.format).toBe('enum')
    expect(esquema.properties.gravedad?.format).toBe('enum')
    expect(esquema.properties.sintomas?.items).toEqual({ type: 'string' })
    expect(esquema.properties.recomendaciones?.items).toEqual({ type: 'string' })
    expect(esquema.properties.frecuenciaRiegoDias?.nullable).toBe(true)
  })

  it('solo exige en required los campos que no admiten null, en el orden de properties', () => {
    // frecuenciaRiegoDias y maceta son nullish, y comparacion es opcional: el
    // modelo puede omitirlos. Un análisis sin comparar es el caso normal.
    expect(esquema.required).not.toContain('frecuenciaRiegoDias')
    expect(esquema.required).not.toContain('maceta')
    expect(esquema.required).not.toContain('comparacion')
    expect(esquema.required).toEqual(
      Object.keys(esquema.properties).filter(
        (c) => c !== 'frecuenciaRiegoDias' && c !== 'maceta' && c !== 'comparacion',
      ),
    )
  })

  it('declara comparacion como objeto opcional con el enum de tendencia', () => {
    const comparacion = esquema.properties.comparacion as {
      type: string
      properties: Record<string, Record<string, unknown>>
      required: string[]
    }

    expect(comparacion.type).toBe('object')
    expect(comparacion.required).toEqual(['tendencia', 'detalle', 'habiaAnterior'])
    expect(comparacion.properties.tendencia).toEqual({
      type: 'string',
      format: 'enum',
      enum: ['mejor', 'igual', 'peor'],
      description: expect.any(String),
    })
    expect(Object.keys(comparacion.properties)).toEqual(['tendencia', 'detalle', 'habiaAnterior'])
  })

  it('es serializable: el cuerpo de la petición no puede romperse', () => {
    expect(() => JSON.stringify(esquema)).not.toThrow()
  })
})