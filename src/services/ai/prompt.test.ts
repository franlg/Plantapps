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