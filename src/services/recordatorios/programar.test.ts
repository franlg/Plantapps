import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import type { Db } from '@/services/contracts'
import type { ConfigRecordatorios } from '@/types'
import { createMemoryDb } from '@/db/memory'
import { calcularAvisos } from './programar'

/**
 * Fecha fija para todos los tests: 20 de mayo de 2026 a las 10:00 en hora local.
 * `calcularAvisos` recibe el instante por parámetro, así que nada depende del
 * reloj real y estos asserts no se rompen mañana.
 */
const AHORA = new Date(2026, 4, 20, 10, 0, 0)

const CONFIG: ConfigRecordatorios = { activos: true, hora: '09:00', diasAnticipacion: 0 }

/** Día local (a mediodía) que cae `dias` días antes o después de `AHORA`. */
function dia(offset: number): Date {
  return new Date(AHORA.getFullYear(), AHORA.getMonth(), AHORA.getDate() + offset, 12, 0, 0)
}

interface Opciones {
  /** Ciclo de riego en días. */
  frecuencia: number
  /** Días desde hoy hasta el último riego. */
  regadaHace?: number
  /** Fecha `YYYY-MM-DD` de plantación. */
  plantadaEl?: string
  archivada?: boolean
}

async function crearPlanta(db: Db, nombre: string, opciones: Opciones) {
  const planta = await db.plants.create({
    nombre,
    frecuenciaRiegoDias: opciones.frecuencia,
    fechaPlantado: opciones.plantadaEl,
  })
  if (opciones.regadaHace != null) {
    await db.events.create({
      plantId: planta.id,
      tipo: 'riego',
      fecha: dia(-opciones.regadaHace).toISOString(),
    })
  }
  if (opciones.archivada) await db.plants.setArchivada(planta.id, true)
  return planta
}

/** Aviso de una planta concreta, sea el que sea. */
function avisoDe(avisos: Array<{ plantId: string; para: string; titulo: string; cuerpo: string }>, plantId: string) {
  return avisos.find((aviso) => aviso.plantId === plantId)
}

describe('calcularAvisos: cuándo no hay nada que programar', () => {
  it('con el interruptor apagado no devuelve ni un aviso', async () => {
    const db = createMemoryDb()
    await crearPlanta(db, 'Monstera', { frecuencia: 10, regadaHace: 20 })

    const avisos = await calcularAvisos(db, { ...CONFIG, activos: false }, AHORA)

    expect(avisos).toEqual([])
  })

  it('sin plantas tampoco hay avisos', async () => {
    const db = createMemoryDb()

    expect(await calcularAvisos(db, CONFIG, AHORA)).toEqual([])
  })

  it('una planta sin ninguna referencia de riego se queda sin aviso', async () => {
    const db = createMemoryDb()
    // Sin fecha de plantación ni riegos: no hay ningún día del que deducir el riego.
    const planta = await crearPlanta(db, 'Recién comprada', { frecuencia: 7 })

    const s = await db.reminders.estado(planta.id, AHORA)
    expect(s.estado).toBe('nunca_regada')

    expect(await calcularAvisos(db, CONFIG, AHORA)).toEqual([])
  })

  it('una planta sin frecuencia conocida se queda sin aviso', async () => {
    const base = createMemoryDb()
    const planta = await crearPlanta(base, 'Sin ciclo', { frecuencia: 5, regadaHace: 1 })
    // Se falsea solo lo que el motor de riego devuelve, para poder cubrir el
    // caso en el que no se sabe cada cuánto hay que regar.
    const db: Db = {
      ...base,
      reminders: {
        ...base.reminders,
        estado: async () => ({
          plantId: planta.id,
          estado: 'proximo' as const,
          diasDesdeRiego: 1,
          diasParaRiego: 4,
          diasDesdePlantado: 30,
          frecuenciaDias: null,
        }),
      },
    }

    expect(await calcularAvisos(db, CONFIG, AHORA)).toEqual([])
  })
})

describe('calcularAvisos: cuándo toca regar', () => {
  it('una planta al día recibe el aviso el día que le toca, a la hora pedida', async () => {
    const db = createMemoryDb()
    // Ciclo de 10 días regada hace 2: faltan 8.
    const planta = await crearPlanta(db, 'Poto del despacho', { frecuencia: 10, regadaHace: 2 })

    const avisos = await calcularAvisos(db, CONFIG, AHORA)
    const aviso = avisoDe(avisos, planta.id)

    expect(avisos).toHaveLength(1)
    expect(aviso?.titulo).toBe('Poto del despacho: toca regar')
    expect(aviso?.cuerpo).toBe('Toca regar en 8 días')
    const instante = new Date(aviso?.para ?? '')
    expect(instante.getTime()).toBe(dia(8).setHours(9, 0, 0, 0))
  })

  it('distingue "hoy", "mañana" y "en X días" en el cuerpo', async () => {
    const db = createMemoryDb()
    const hoy = await crearPlanta(db, 'Hoy', { frecuencia: 5, regadaHace: 5 })
    const manana = await crearPlanta(db, 'Mañana', { frecuencia: 6, regadaHace: 5 })
    const dentro = await crearPlanta(db, 'Dentro', { frecuencia: 9, regadaHace: 5 })

    const avisos = await calcularAvisos(db, CONFIG, AHORA)

    expect(avisoDe(avisos, hoy.id)?.cuerpo).toBe('Toca regar hoy')
    expect(avisoDe(avisos, manana.id)?.cuerpo).toBe('Toca regar mañana')
    expect(avisoDe(avisos, dentro.id)?.cuerpo).toBe('Toca regar en 4 días')
  })

  it('anticipa los días que pidan los ajustes', async () => {
    const db = createMemoryDb()
    const planta = await crearPlanta(db, 'Ficus', { frecuencia: 10, regadaHace: 2 })

    const avisos = await calcularAvisos(db, { ...CONFIG, diasAnticipacion: 3 }, AHORA)

    // Faltan 8 días para el riego y se avisa 3 antes: dentro de 5, a las 09:00.
    const instante = new Date(avisoDe(avisos, planta.id)?.para ?? '')
    expect(instante.getTime()).toBe(dia(5).setHours(9, 0, 0, 0))
    // El texto sigue hablando del riego, no del momento del aviso.
    expect(avisoDe(avisos, planta.id)?.cuerpo).toBe('Toca regar en 8 días')
  })

  it('aplica la hora local de los ajustes', async () => {
    const db = createMemoryDb()
    const planta = await crearPlanta(db, 'Helecho', { frecuencia: 4, regadaHace: 1 })

    const avisos = await calcularAvisos(db, { ...CONFIG, hora: '21:45' }, AHORA)
    const instante = new Date(avisoDe(avisos, planta.id)?.para ?? '')

    expect(instante.getHours()).toBe(21)
    expect(instante.getMinutes()).toBe(45)
    expect(instante.getDate()).toBe(dia(3).getDate())
  })

  it('una hora imposible cae en las 09:00 en vez de romperse', async () => {
    const db = createMemoryDb()
    const planta = await crearPlanta(db, 'Cactus', { frecuencia: 20, regadaHace: 2 })

    for (const hora of ['', 'noche', '25:00', '09:99', '9']) {
      const aviso = avisoDe(await calcularAvisos(db, { ...CONFIG, hora }, AHORA), planta.id)
      expect(new Date(aviso?.para ?? '').getHours(), hora).toBe(9)
    }
  })
})

describe('calcularAvisos: los avisos pasados se empujan hacia adelante', () => {
  it('una planta con el riego vencido salta al siguiente ciclo', async () => {
    const db = createMemoryDb()
    // Ciclos de 10 días regada hace 14: el aviso "natural" sería hace 4 días.
    const planta = await crearPlanta(db, 'Monstera del salón', { frecuencia: 10, regadaHace: 14 })

    const s = await db.reminders.estado(planta.id, AHORA)
    expect(s.estado).toBe('vencido')
    expect(s.diasParaRiego).toBe(-4)

    const avisos = await calcularAvisos(db, CONFIG, AHORA)
    const aviso = avisoDe(avisos, planta.id)

    // -4 + 10 = dentro de 6 días: el aviso no se pierde, se retrasa un ciclo.
    expect(new Date(aviso?.para ?? '').getTime()).toBe(dia(6).setHours(9, 0, 0, 0))
    expect(aviso?.titulo).toBe('Monstera del salón: necesita agua')
    expect(aviso?.cuerpo).toBe('Lleva 14 días sin regar')
  })

  it('con antelación, si el momento cae en el pasado también salta de ciclo', async () => {
    const db = createMemoryDb()
    const planta = await crearPlanta(db, 'Aloe', { frecuencia: 7, regadaHace: 5 })

    // Toca regar en 2 días y se avisa 2 antes: el aviso sería hoy a las 09:00,
    // que ya ha pasado (son las 10:00), así que va al ciclo siguiente.
    const avisos = await calcularAvisos(db, { ...CONFIG, diasAnticipacion: 2 }, AHORA)
    const instante = new Date(avisoDe(avisos, planta.id)?.para ?? '')

    expect(instante.getTime()).toBe(dia(7).setHours(9, 0, 0, 0))
  })

  it('todos los avisos quedan en el futuro, aunque haya muchos ciclos de retraso', async () => {
    const db = createMemoryDb()
    const olvidada = await crearPlanta(db, 'Olvidada', { frecuencia: 5, regadaHace: 120 })
    const nueva = await crearPlanta(db, 'Nueva', { frecuencia: 4, regadaHace: 1 })

    const avisos = await calcularAvisos(db, { ...CONFIG, diasAnticipacion: 3 }, AHORA)

    expect(avisos.length).toBe(2)
    for (const aviso of avisos) {
      expect(new Date(aviso.para).getTime(), aviso.para).toBeGreaterThan(AHORA.getTime())
    }
    // La olvidada lleva 120 días sin regar: el aviso cae en el ciclo que le toca
    // por delante, no dentro de dos años.
    const instanteOlvidada = new Date(avisoDe(avisos, olvidada.id)?.para ?? '')
    expect(instanteOlvidada.getTime()).toBeGreaterThan(AHORA.getTime())
    expect(instanteOlvidada.getTime()).toBeLessThanOrEqual(dia(8).setHours(9, 0, 0, 0))
    // Y la nueva, a la que solo le falta un ciclo, va al primer futuro real.
    expect(new Date(avisoDe(avisos, nueva.id)?.para ?? '').getTime()).toBe(dia(4).setHours(9, 0, 0, 0))
  })
})

describe('calcularAvisos: lista completa y determinista', () => {
  it('solo mira plantas no archivadas', async () => {
    const db = createMemoryDb()
    const activa = await crearPlanta(db, 'Activa', { frecuencia: 6, regadaHace: 5 })
    const archivada = await crearPlanta(db, 'Archivada', { frecuencia: 6, regadaHace: 5, archivada: true })

    const avisos = await calcularAvisos(db, CONFIG, AHORA)

    expect(avisoDe(avisos, activa.id)).toBeDefined()
    expect(avisoDe(avisos, archivada.id)).toBeUndefined()
    expect(avisos).toHaveLength(1)
  })

  it('ordena por fecha y da un id estable a cada aviso', async () => {
    const db = createMemoryDb()
    const tarde = await crearPlanta(db, 'Tarde', { frecuencia: 10, regadaHace: 1 })
    const pronto = await crearPlanta(db, 'Pronto', { frecuencia: 5, regadaHace: 4 })

    const avisos = await calcularAvisos(db, CONFIG, AHORA)

    expect(avisos.map((a) => a.plantId)).toEqual([pronto.id, tarde.id])
    for (const aviso of avisos) {
      expect(aviso.id).toBe(`${aviso.plantId}:${aviso.para}`)
      expect(new Set(avisos.map((a) => a.id)).size).toBe(avisos.length)
    }
  })

  it('dos llamadas seguidas devuelven exactamente la misma lista', async () => {
    const db = createMemoryDb()
    await crearPlanta(db, 'Monstera', { frecuencia: 10, regadaHace: 12 })
    await crearPlanta(db, 'Poto', { frecuencia: 7, regadaHace: 6 })
    await crearPlanta(db, 'Sin datos', { frecuencia: 7 })

    const primera = await calcularAvisos(db, { ...CONFIG, diasAnticipacion: 1 }, AHORA)
    const segunda = await calcularAvisos(db, { ...CONFIG, diasAnticipacion: 1 }, AHORA)

    expect(primera).toEqual(segunda)
    expect(primera).toHaveLength(2)
  })

  it('no escribe nada en la base de datos', async () => {
    const db = createMemoryDb()
    await crearPlanta(db, 'Monstera', { frecuencia: 10, regadaHace: 12 })
    const antes = db.version

    await calcularAvisos(db, CONFIG, AHORA)

    expect(db.version).toBe(antes)
  })
})