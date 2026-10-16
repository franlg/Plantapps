import { describe, expect, it } from 'vitest'
import type { PlantContext } from '@/types'
import { construirPrompt } from './prompt'

const CONTEXTO: PlantContext = {
  nombre: 'Monstera del salón',
  especie: 'Monstera deliciosa',
  diasDesdePlantado: 120,
  maceta: 'maceta de 18 cm',
  ubicacion: 'sala, junto a la ventana',
  luz: 'sol_indirecto',
  notas: 'la regaloé en mi cumple',
  ultimoRiego: '2026-10-01T10:00:00.000Z',
  diasDesdeUltimoRiego: 13,
  frecuenciaRiegoDias: 7,
  historial: ['1 oct 2026 · Riego registrado', '12 sep 2026 · Trasplantada'],
}

describe('construirPrompt', () => {
  it('pone el papel de experto y avisa de que el usuario no es experto', () => {
    const prompt = construirPrompt(CONTEXTO)

    expect(prompt).toContain('experto en el cuidado de plantas de interior')
    expect(prompt).toContain('no es jardinero')
  })

  it('incluye todos los datos de la planta', () => {
    const prompt = construirPrompt(CONTEXTO)

    expect(prompt).toContain('Monstera del salón')
    expect(prompt).toContain('Monstera deliciosa')
    expect(prompt).toContain('120')
    expect(prompt).toContain('maceta de 18 cm')
    expect(prompt).toContain('sala, junto a la ventana')
    expect(prompt).toContain('Sol indirecto')
    expect(prompt).toContain('13')
    expect(prompt).toContain('la regaloé en mi cumple')
    expect(prompt).toContain('1 oct 2026 · Riego registrado')
    expect(prompt).toContain('12 sep 2026 · Trasplantada')
  })

  it('hace las cinco preguntas del diagnóstico', () => {
    const prompt = construirPrompt(CONTEXTO)

    expect(prompt).toContain('¿Hay que regar ahora?')
    expect(prompt).toContain('¿Cada cuántos días conviene regarla')
    expect(prompt).toContain('¿Hay que trasplantar?')
    expect(prompt).toContain('¿Se ve algún problema?')
    expect(prompt).toContain('¿Qué signos o síntomas concretos se ven en la foto?')
  })

  it('pide JSON puro, en español y sin inventar', () => {
    const prompt = construirPrompt(CONTEXTO)

    expect(prompt).toContain('Responde ÚNICAMENTE con un objeto JSON válido')
    expect(prompt).toContain('en español')
    expect(prompt).toContain('No inventes datos')
    expect(prompt).toContain('baja "confianza" a "baja"')
    expect(prompt).toContain('Máximo 160 caracteres')
  })

  it('no rompe con una planta sin datos', () => {
    const prompt = construirPrompt({
      nombre: 'Planta sin nombre',
      diasDesdePlantado: null,
      ultimoRiego: null,
      diasDesdeUltimoRiego: null,
      frecuenciaRiegoDias: null,
      historial: [],
    })

    expect(prompt).toContain('Planta sin nombre')
    expect(prompt).toContain('nunca se ha regado')
    expect(prompt).toContain('sin datos')
    expect(prompt).toContain('sin eventos registrados')

    // El bloque de datos no puede llevar null ni undefined: se verían como ruido.
    const datos = prompt.split('LO QUE TIENES QUE RESPONDER')[0] ?? ''
    expect(datos).not.toContain('undefined')
    expect(datos).not.toContain('null')
  })

  it('acepta la luz como texto libre si no es un código conocido', () => {
    const prompt = construirPrompt({ ...CONTEXTO, luz: 'mucha luz natural por la mañana' })
    expect(prompt).toContain('mucha luz natural por la mañana')
  })

  it('recorta un historial enorme', () => {
    const historial = Array.from({ length: 40 }, (_, i) => `evento ${i}`)
    const prompt = construirPrompt({ ...CONTEXTO, historial })

    expect(prompt).toContain('evento 0')
    expect(prompt).toContain('evento 9')
    expect(prompt).not.toContain('evento 10')
  })
})

describe('construirPrompt con foto anterior', () => {
  it('avisa de que hay DOS fotos y dice cuál es cada una', () => {
    const prompt = construirPrompt(CONTEXTO, { tieneFotoAnterior: true })

    expect(prompt).toContain('DOS fotos de la misma planta')
    expect(prompt).not.toContain('una única foto')
    expect(prompt).toContain('La PRIMERA imagen es la foto de AHORA')
    expect(prompt).toContain('La SEGUNDA imagen es la foto de un análisis anterior')
  })

  it('pide la comparación concreta: hojas nuevas, altura, color y manchas', () => {
    const prompt = construirPrompt(CONTEXTO, { tieneFotoAnterior: true })

    expect(prompt).toContain('COMPARACIÓN')
    expect(prompt).toContain('hojas nuevas')
    expect(prompt).toContain('altura y porte')
    expect(prompt).toContain('color')
    expect(prompt).toContain('manchas o síntomas que aparezcan o desaparezcan')
    expect(prompt).toContain('"tendencia": "mejor"')
  })

  it('pide honestidad cuando no se puede comparar y no inventar cambios', () => {
    const prompt = construirPrompt(CONTEXTO, { tieneFotoAnterior: true })

    expect(prompt).toContain('Sé HONESTO')
    expect(prompt).toContain('"habiaAnterior": false')
    expect(prompt).toContain('NO INVENTES CAMBIOS')
    expect(prompt).toContain('"tendencia" es "igual"')
    expect(prompt).toContain('otro ángulo, con otra luz')
  })

  it('pasa la fecha del análisis anterior cuando se sabe', () => {
    const prompt = construirPrompt(CONTEXTO, { tieneFotoAnterior: true, fechaAnterior: '3 de octubre de 2026' })
    expect(prompt).toContain('del 3 de octubre de 2026')
  })

  it('dice "de hace un tiempo" si no se sabe la fecha', () => {
    const prompt = construirPrompt(CONTEXTO, { tieneFotoAnterior: true })
    expect(prompt).toContain('de hace un tiempo')
    expect(prompt).not.toContain('undefined')

    const sinFecha = construirPrompt(CONTEXTO, { tieneFotoAnterior: true, fechaAnterior: '   ' })
    expect(sinFecha).toContain('de hace un tiempo')
  })

  it('sin foto anterior no menciona la comparación y la prohíbe expresamente', () => {
    const prompt = construirPrompt(CONTEXTO)

    expect(prompt).toContain('una única foto')
    expect(prompt).not.toContain('DOS fotos')
    expect(prompt).not.toContain('SEGUNDA imagen')
    expect(prompt).toContain('NO TE PASO NINGUNA FOTO ANTERIOR')
    expect(prompt).toContain('deja el campo "comparacion" FUERA de la respuesta')
  })

  it('tampoco compara si la opción viene con tieneFotoAnterior en false', () => {
    const prompt = construirPrompt(CONTEXTO, { tieneFotoAnterior: false })
    expect(prompt).toContain('una única foto')
    expect(prompt).toContain('NO TE PASO NINGUNA FOTO ANTERIOR')
  })

  it('los datos de la planta se mantienen intactos con y sin comparación', () => {
    const conComparacion = construirPrompt(CONTEXTO, { tieneFotoAnterior: true })
    const sinComparacion = construirPrompt(CONTEXTO)

    for (const prompt of [conComparacion, sinComparacion]) {
      expect(prompt).toContain('Monstera del salón')
      expect(prompt).toContain('¿Hay que regar ahora?')
      expect(prompt).toContain('Responde ÚNICAMENTE con un objeto JSON válido')
    }

    // Lo único que cambia entre los dos es el bloque de la comparación.
    const datos = (prompt: string) => prompt.split('DATOS DE LA PLANTA')[1]?.split('\n\n')[0] ?? ''
    expect(datos(conComparacion)).toBe(datos(sinComparacion))
  })
})