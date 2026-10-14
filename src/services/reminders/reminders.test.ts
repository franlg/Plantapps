import { describe, expect, it } from 'vitest'
import { createMemoryDb } from '@/db/memory'
import { toIsoDate } from '@/lib/dates'
import type { AiAnalysisDraft, Gravedad, Veredicto } from '@/types'
import { FRECUENCIA_POR_DEFECTO, createReminderService, frecuenciaSugerida } from '@/services/reminders'

/**
 * Instante de referencia de los datos de prueba.
 * Riegos y fechas de plantación se calculan con días de calendario respecto a
 * aquí, así que los tests no esperan a ningún día: a `estado` se le pasa un
 * instante explícito y `attention` usa ese mismo reloj.
 */
const HOY = new Date()

/** Instante ISO de hace `dias` días a mediodía (siempre cae en el mismo día de calendario). */
function haceDias(dias: number): string {
  return new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() - dias, 12, 0, 0).toISOString()
}

/** Fecha `YYYY-MM-DD` de hace `dias` días, para `fechaPlantado`. */
function plantadaHace(dias: number): string {
  return toIsoDate(new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() - dias, 12, 0, 0))
}

/** `HOY` desplazado `dias` días, para pasarle un `now` explícito a `estado`. */
function en(dias: number): Date {
  return new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + dias, HOY.getHours(), 0, 0)
}

interface PlantOpts {
  especie?: string
  frecuencia?: number
  /** Días desde hoy hasta la plantación. */
  plantadaHace?: number
  /** Fecha `YYYY-MM-DD` exacta, para escenarios que miran a otra fecha. */
  plantadaEl?: string
  /** Días desde hoy hasta el último riego. */
  regadaHace?: number
}

async function crearPlanta(nombre: string, opts: PlantOpts = {}) {
  const db = createMemoryDb()
  const planta = await db.plants.create({
    nombre,
    especie: opts.especie,
    frecuenciaRiegoDias: opts.frecuencia,
    fechaPlantado: opts.plantadaEl ?? (opts.plantadaHace == null ? undefined : plantadaHace(opts.plantadaHace)),
  })
  if (opts.regadaHace != null) {
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(opts.regadaHace) })
  }
  return { db, planta }
}

/** Guarda un análisis de IA tal y como lo dejaría el servicio real. */
async function conAnalisis(
  db: ReturnType<typeof createMemoryDb>,
  plantId: string,
  extra: Partial<AiAnalysisDraft> & { veredicto: Veredicto },
): Promise<void> {
  await db.analyses.create({
    photoId: 'foto-de-prueba',
    modelo: 'test',
    salud: 45,
    accionPrincipal: 'Revisar el sustrato',
    regar: false,
    frecuenciaRiegoDias: null,
    sintomas: [],
    recomendaciones: [],
    confianza: 'media',
    resumen: 'La planta tiene manchas',
    ...extra,
    plantId,
  })
}

describe('frecuencias por especie', () => {
  it('normaliza capitalización, acentos y espacios sobrantes', () => {
    const base = frecuenciaSugerida('Monstera')
    expect(frecuenciaSugerida('monstera')).toBe(base)
    expect(frecuenciaSugerida('monstera deliciosa')).toBe(base)
    expect(frecuenciaSugerida('MONSTERA DELICIOSA')).toBe(base)
    expect(frecuenciaSugerida('  Monstera   Deliciosa  ')).toBe(base)
    expect(frecuenciaSugerida('Monstera')).toBe(10)
  })

  it('quita los acentos al comparar', () => {
    expect(frecuenciaSugerida('Cítrico')).toBe(8)
    expect(frecuenciaSugerida('CITRICO')).toBe(8)
    expect(frecuenciaSugerida('citrico')).toBe(8)
    expect(frecuenciaSugerida('Orquídea')).toBe(9)
    expect(frecuenciaSugerida('orquidea')).toBe(9)
    expect(frecuenciaSugerida('Áloe')).toBe(18)
    expect(frecuenciaSugerida('aloe')).toBe(18)
    expect(frecuenciaSugerida('Ciprés')).toBe(12)
    expect(frecuenciaSugerida('cipres')).toBe(12)
  })

  it('gana el alias más específico antes que el genérico', () => {
    // 'Ficus lyrata' es más larga que 'Ficus', así que no se pierde por el comodín.
    expect(frecuenciaSugerida('Ficus')).toBe(9)
    expect(frecuenciaSugerida('Ficus lyrata')).toBe(8)
    expect(frecuenciaSugerida('Ficus')).not.toBe(frecuenciaSugerida('Ficus lyrata'))

    expect(frecuenciaSugerida('Ficus BENJAMINA')).toBe(8)
    expect(frecuenciaSugerida('Ficus elastica')).toBe(12)
    expect(frecuenciaSugerida('Dracaena trifasciata')).toBe(18)
    expect(frecuenciaSugerida('Aloe')).toBe(18)
    expect(frecuenciaSugerida('Aloe vera')).toBe(15)
    expect(frecuenciaSugerida('Helecho de Boston')).toBe(frecuenciaSugerida('Helecho'))
  })

  it('solo casa por palabras enteras', () => {
    expect(frecuenciaSugerida('Arómatas')).toBe(FRECUENCIA_POR_DEFECTO)
    expect(frecuenciaSugerida('Cactusferopsis')).toBe(FRECUENCIA_POR_DEFECTO)
    // 'lirio de paz' no puede confundirse con un lirio de valle cualquiera.
    expect(frecuenciaSugerida('Lirio de valle')).toBe(FRECUENCIA_POR_DEFECTO)
  })

  it('cubre más de 30 plantas de casa y de jardín', () => {
    const especies = [
      'Monstera', 'Ficus', 'Ficus lyrata', 'Ficus benjamina', 'Poto', 'Sansevieria', 'Cactus',
      'Aloe vera', 'Haworthia', 'Helecho', 'Nephrolepis', 'Musgo', 'Calathea', 'Maranta',
      'Orquídea', 'Spathiphyllum', 'Dieffenbachia', 'Strelitzia', 'Palmera', 'Azalea', 'Begonia',
      'Bambú', 'Lavanda', 'Romero', 'Menta', 'Hierbabuena', 'Albahaca', 'Tomate', 'Jazmín',
      'Bougainvillea', 'Hortensia', 'Geranio', 'Petunia', 'Girasol', 'Salvia', 'Fresa', 'Lechuga',
      'Pimiento', 'Cítrico', 'Ciprés', 'Kalanchoe', 'Schlumbergera', 'Olivo',
    ]

    for (const especie of especies) {
      const dias = frecuenciaSugerida(especie)
      expect(dias, especie).not.toBeNull()
      expect(Number.isInteger(dias), especie).toBe(true)
      expect(dias, especie).toBeGreaterThanOrEqual(1)
      // Que no caiga en el valor genérico demuestra que está en la tabla.
      expect(dias, especie).not.toBe(FRECUENCIA_POR_DEFECTO)
    }
  })

  it('devuelve el valor por defecto si la especie no está en la tabla', () => {
    expect(frecuenciaSugerida('Flor de loto')).toBe(FRECUENCIA_POR_DEFECTO)
    expect(frecuenciaSugerida('Planta que no existe')).toBe(FRECUENCIA_POR_DEFECTO)
  })

  it('devuelve null si la planta no dice qué especie es', () => {
    expect(frecuenciaSugerida(undefined)).toBeNull()
    expect(frecuenciaSugerida('')).toBeNull()
    expect(frecuenciaSugerida('   ')).toBeNull()
    expect(frecuenciaSugerida(undefined, 7)).toBeNull()
  })
})

describe('estacionalidad', () => {
  const INVIERNO = 1 // enero
  const VERANO = 7 // julio
  const PRIMAVERA = 4 // abril

  it('sin mes no aplica ningún ajuste', () => {
    expect(frecuenciaSugerida('Monstera')).toBe(10)
    expect(frecuenciaSugerida('Geranio')).toBe(3)
    expect(frecuenciaSugerida('Geranio', PRIMAVERA)).toBe(3)
  })

  it('en invierno el exterior se riega la mitad de veces', () => {
    const invierno = frecuenciaSugerida('Geranio', INVIERNO) as number
    const verano = frecuenciaSugerida('Geranio', VERANO) as number

    expect(verano).toBe(3)
    expect(invierno).toBe(6)
    expect(invierno).toBeGreaterThan(verano)
  })

  it('a una suculenta el mes no le cambia nada', () => {
    const invierno = frecuenciaSugerida('Aloe vera', INVIERNO) as number
    const verano = frecuenciaSugerida('Aloe vera', VERANO) as number

    expect(invierno).toBe(15)
    expect(verano).toBe(15)
    expect(invierno).toBe(verano)
  })

  it('a una planta de interior el mes solo mueve el intervalo un ±20 %', () => {
    const base = frecuenciaSugerida('Monstera') as number
    const invierno = frecuenciaSugerida('Monstera', INVIERNO) as number
    const verano = frecuenciaSugerida('Monstera', VERANO) as number

    expect(base).toBe(10)
    expect(invierno).toBe(12)
    expect(verano).toBe(8)
    expect(Math.abs(invierno - base) / base).toBeLessThanOrEqual(0.2)
    expect(Math.abs(verano - base) / base).toBeLessThanOrEqual(0.2)
  })

  it('el bambú tiene su propio ritmo: parado en invierno y sediento en verano', () => {
    expect(frecuenciaSugerida('Bambú')).toBe(3)
    expect(frecuenciaSugerida('Bambú', INVIERNO)).toBe(6)
    expect(frecuenciaSugerida('Bambú', VERANO)).toBe(2)
  })

  it('diciembre, enero y febrero son invierno', () => {
    for (const mes of [12, 1, 2]) {
      expect(frecuenciaSugerida('Geranio', mes), `mes ${mes}`).toBe(6)
    }
    for (const mes of [3, 4, 5, 9, 10, 11]) {
      expect(frecuenciaSugerida('Geranio', mes), `mes ${mes}`).toBe(3)
    }
  })

  it('ignora meses imposibles y siempre devuelve un entero >= 1', () => {
    expect(frecuenciaSugerida('Geranio', 0)).toBe(3)
    expect(frecuenciaSugerida('Geranio', 13)).toBe(3)
    expect(frecuenciaSugerida('Geranio', Number.NaN)).toBe(3)

    for (let mes = 1; mes <= 12; mes += 1) {
      for (const especie of ['Monstera', 'Geranio', 'Aloe vera', 'Bambú', 'Tomate', 'Palmera']) {
        const dias = frecuenciaSugerida(especie, mes) as number
        expect(Number.isInteger(dias), `${especie} mes ${mes}`).toBe(true)
        expect(dias, `${especie} mes ${mes}`).toBeGreaterThanOrEqual(1)
      }
    }
  })
})

describe('estado(plantId, now)', () => {
  it('avisa como "proximo" con dos días de margen', async () => {
    const { db, planta } = await crearPlanta('Monstera', { frecuencia: 10, regadaHace: 7 })

    // Quedan 3 días: todavía no toca avisar.
    const hoy = await db.reminders.estado(planta.id, HOY)
    expect(hoy.estado).toBe('al_dia')
    expect(hoy.diasParaRiego).toBe(3)

    // El umbral es 2 días inclusive: con 2 días ya sale el aviso.
    const enDos = await db.reminders.estado(planta.id, en(1))
    expect(enDos.estado).toBe('proximo')
    expect(enDos.diasParaRiego).toBe(2)

    const enUno = await db.reminders.estado(planta.id, en(2))
    expect(enUno.estado).toBe('proximo')
    expect(enUno.diasParaRiego).toBe(1)

    const hoyToca = await db.reminders.estado(planta.id, en(3))
    expect(hoyToca.estado).toBe('proximo')
    expect(hoyToca.diasParaRiego).toBe(0)

    const tarde = await db.reminders.estado(planta.id, en(4))
    expect(tarde.estado).toBe('vencido')
    expect(tarde.diasParaRiego).toBe(-1)
  })

  it('no alarma a una planta recién plantada y sin riegos: está en arraigo', async () => {
    const { db, planta } = await crearPlanta('Higuera', { frecuencia: 7, plantadaHace: 2 })
    const s = await db.reminders.estado(planta.id, HOY)

    expect(s.estado).toBe('al_dia')
    expect(s.diasDesdeRiego).toBeNull()
    expect(s.diasDesdePlantado).toBe(2)
    expect(s.frecuenciaDias).toBe(7)
    // Le quedan 5 días para el primer riego, así que no hay nada que avisar.
    expect(s.diasParaRiego).toBe(5)
    expect(await db.reminders.attention()).toHaveLength(0)
  })

  it('pasado el periodo de arraigo sí dice que nunca se ha regado', async () => {
    const { db, planta } = await crearPlanta('Higuera', { frecuencia: 7, plantadaHace: 10 })
    const s = await db.reminders.estado(planta.id, HOY)

    expect(s.estado).toBe('nunca_regada')
    expect(s.diasDesdePlantado).toBe(10)
    expect(s.diasDesdeRiego).toBeNull()
    expect(s.diasParaRiego).toBeNull()
  })

  it('sin fecha de plantación y sin riegos siempre es "nunca regada"', async () => {
    const { db, planta } = await crearPlanta('Recién comprada', { frecuencia: 7 })
    expect((await db.reminders.estado(planta.id, HOY)).estado).toBe('nunca_regada')
  })

  it('deduce la frecuencia de la especie y la ajusta con el mes', async () => {
    // Plantada hace tiempo y sin riegos: el estado es 'nunca_regada' en ambos
    // casos, pero la frecuencia propuesta cambia con la estación.
    const julio = await crearPlanta('Geranio de julio', { especie: 'Geranio', plantadaEl: '2025-07-01' })
    const sJulio = await julio.db.reminders.estado(julio.planta.id, new Date(2026, 6, 20, 12))
    expect(sJulio.frecuenciaDias).toBe(3) // geranio de exterior en pleno verano
    expect(sJulio.estado).toBe('nunca_regada')

    const enero = await crearPlanta('Geranio de enero', { especie: 'Geranio', plantadaEl: '2025-07-01' })
    const sEnero = await enero.db.reminders.estado(enero.planta.id, new Date(2026, 0, 20, 12))
    expect(sEnero.frecuenciaDias).toBe(6) // el mismo geranio, invernando

    const suculenta = await crearPlanta('Aloe', { especie: 'Aloe vera', plantadaEl: '2025-07-01' })
    const sAloe = await suculenta.db.reminders.estado(suculenta.planta.id, new Date(2026, 0, 20, 12))
    expect(sAloe.frecuenciaDias).toBe(15) // las suculentas no se tocan por el mes

    const sinNombre = await crearPlanta('Sin nombre botánico', { plantadaHace: 30 })
    const sGenerica = await sinNombre.db.reminders.estado(sinNombre.planta.id, HOY)
    expect(sGenerica.frecuenciaDias).toBe(FRECUENCIA_POR_DEFECTO)
  })

  it('la frecuencia configurada por el usuario manda sobre la especie', async () => {
    const { db, planta } = await crearPlanta('Monstera', { especie: 'Monstera', frecuencia: 3, regadaHace: 3 })
    const s = await db.reminders.estado(planta.id, HOY)

    expect(s.frecuenciaDias).toBe(3)
    expect(s.diasParaRiego).toBe(0)
    expect(s.estado).toBe('proximo')
  })

  it('el resultado depende solo del instante que se le pase', async () => {
    const { db, planta } = await crearPlanta('Poto', { frecuencia: 7, regadaHace: 5 })

    const inicio = await db.reminders.estado(planta.id, HOY)
    expect(inicio.estado).toBe('proximo')
    expect(inicio.diasDesdeRiego).toBe(5)

    const dosDiasDespues = await db.reminders.estado(planta.id, en(2))
    expect(dosDiasDespues.estado).toBe('proximo')
    expect(dosDiasDespues.diasDesdeRiego).toBe(7)

    const cuatroDiasDespues = await db.reminders.estado(planta.id, en(4))
    expect(cuatroDiasDespues.estado).toBe('vencido')
    expect(cuatroDiasDespues.diasParaRiego).toBe(-2)
  })

  it('no depende de la hora del día', async () => {
    const db = createMemoryDb()
    const planta = await db.plants.create({ nombre: 'Ficus', frecuenciaRiegoDias: 7 })
    // Regada hoy mismo a la una de la madrugada.
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: new Date(2026, 2, 15, 1, 0, 0).toISOString() })

    const aLaUna = await db.reminders.estado(planta.id, new Date(2026, 2, 15, 1, 5, 0))
    const aLasOnce = await db.reminders.estado(planta.id, new Date(2026, 2, 15, 23, 55, 0))

    expect(aLaUna).toEqual(aLasOnce)
    expect(aLaUna.diasDesdeRiego).toBe(0)
    expect(aLasOnce.diasDesdeRiego).toBe(0)
  })
})

describe('attention()', () => {
  it('ordena por urgencia: primero los retrasos más largos', async () => {
    const db = createMemoryDb()
    const retrasoLeve = await db.plants.create({ nombre: 'Retraso leve', frecuenciaRiegoDias: 5 })
    const retrasoTope = await db.plants.create({ nombre: 'Retraso top', frecuenciaRiegoDias: 5 })
    const problema = await db.plants.create({ nombre: 'Con problema', frecuenciaRiegoDias: 5 })
    await db.events.create({ plantId: retrasoLeve.id, tipo: 'riego', fecha: haceDias(6) })
    await db.events.create({ plantId: retrasoTope.id, tipo: 'riego', fecha: haceDias(15) })
    await db.events.create({ plantId: problema.id, tipo: 'riego', fecha: haceDias(1) })
    await conAnalisis(db, problema.id, { veredicto: 'problema', problema: 'Manchas en las hojas' })

    const items = await db.reminders.attention()

    expect(items.map((i) => [i.plantNombre, i.motivo])).toEqual([
      ['Retraso top', 'riego_vencido'],
      ['Retraso leve', 'riego_vencido'],
      ['Con problema', 'analisis_problema'],
    ])
    expect(items[0]?.prioridad).toBeLessThan(items[1]?.prioridad ?? 0)
    expect(items[0]?.detalle).toBe('Lleva 15 días sin regar')
  })

  it('ordena por motivo: retraso, problema de la IA, nunca regada y próximo', async () => {
    const db = createMemoryDb()
    const proxima = await db.plants.create({ nombre: 'A punto', frecuenciaRiegoDias: 7 })
    await db.plants.create({ nombre: 'Olvidada', frecuenciaRiegoDias: 7, fechaPlantado: plantadaHace(40) })
    const salud = await db.plants.create({ nombre: 'Enferma', frecuenciaRiegoDias: 7 })
    const retrasada = await db.plants.create({ nombre: 'Seca', frecuenciaRiegoDias: 7, fechaPlantado: plantadaHace(40) })

    await db.events.create({ plantId: proxima.id, tipo: 'riego', fecha: haceDias(6) })
    await db.events.create({ plantId: salud.id, tipo: 'riego', fecha: haceDias(1) })
    await db.events.create({ plantId: retrasada.id, tipo: 'riego', fecha: haceDias(11) })
    await conAnalisis(db, salud.id, { veredicto: 'problema', gravedad: 'moderada', problema: 'Hojas amarillas' })

    const items = await db.reminders.attention()

    expect(items.map((i) => i.motivo)).toEqual([
      'riego_vencido',
      'analisis_problema',
      'nunca_regada',
      'riego_proximo',
    ])
    expect(items.map((i) => i.detalle)).toEqual([
      'Lleva 11 días sin regar',
      'Último análisis: Hojas amarillas',
      'Sin un solo riego en 40 días desde que la plantaste',
      'Toca regar mañana',
    ])
    // Menor número = más urgente, y el orden va de menor a mayor.
    const prioridades = items.map((i) => i.prioridad)
    expect([...prioridades].sort((a, b) => a - b)).toEqual(prioridades)
  })

  it('avisa de un análisis con veredicto "problema" aunque la gravedad sea leve', async () => {
    const db = createMemoryDb()
    const planta = await db.plants.create({ nombre: 'Con veredicto', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(1) })
    await conAnalisis(db, planta.id, { veredicto: 'problema', gravedad: 'leve', problema: 'Hojas mustias' })

    const items = await db.reminders.attention()

    expect(items).toHaveLength(1)
    expect(items[0]?.motivo).toBe('analisis_problema')
    expect(items[0]?.detalle).toBe('Último análisis: Hojas mustias')
  })

  it('avisa por gravedad moderada o grave aunque el veredicto sea otro', async () => {
    const casos: Array<{ gravedad: Gravedad; veredicto: Veredicto }> = [
      { gravedad: 'moderada', veredicto: 'regar' },
      { gravedad: 'grave', veredicto: 'todo_ok' },
    ]

    for (const caso of casos) {
      const db = createMemoryDb()
      const planta = await db.plants.create({ nombre: 'Enferma', frecuenciaRiegoDias: 7 })
      await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(1) })
      await conAnalisis(db, planta.id, { ...caso, accionPrincipal: 'Cortar las hojas secas' })

      const items = await db.reminders.attention()

      expect(items, caso.gravedad).toHaveLength(1)
      expect(items[0]?.motivo).toBe('analisis_problema')
      // Sin campo `problema` el detalle cae en la acción principal que propuso el modelo.
      expect(items[0]?.detalle).toBe(
        caso.gravedad === 'grave'
          ? 'Último análisis (grave): Cortar las hojas secas'
          : 'Último análisis: Cortar las hojas secas',
      )
    }
  })

  it('no avisa de análisis que dicen que todo está bien', async () => {
    const db = createMemoryDb()
    const planta = await db.plants.create({ nombre: 'Sana', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(1) })
    await conAnalisis(db, planta.id, { veredicto: 'todo_ok', gravedad: 'ninguna' })

    expect(await db.reminders.attention()).toHaveLength(0)
  })

  it('una planta aparece como mucho una vez por motivo, y sin duplicados', async () => {
    const db = createMemoryDb()
    // Riego vencido y problema de salud a la vez: dos motivos distintos, dos líneas.
    const doble = await db.plants.create({ nombre: 'Doble problema', frecuenciaRiegoDias: 5 })
    const otra = await db.plants.create({ nombre: 'Otra', frecuenciaRiegoDias: 5 })
    await db.events.create({ plantId: doble.id, tipo: 'riego', fecha: haceDias(12) })
    await db.events.create({ plantId: otra.id, tipo: 'riego', fecha: haceDias(12) })
    await conAnalisis(db, doble.id, { veredicto: 'problema', gravedad: 'grave', problema: 'Podredumbre' })
    await conAnalisis(db, otra.id, { veredicto: 'problema', gravedad: 'grave', problema: 'Podredumbre' })

    const items = await db.reminders.attention()

    expect(items.map((i) => [i.plantNombre, i.motivo])).toEqual([
      ['Doble problema', 'riego_vencido'],
      ['Otra', 'riego_vencido'],
      ['Doble problema', 'analisis_problema'],
      ['Otra', 'analisis_problema'],
    ])

    const claves = items.map((i) => `${i.plantId}|${i.motivo}`)
    expect(new Set(claves).size).toBe(claves.length)
    expect(items.map((i) => i.detalle)).toEqual([
      'Lleva 12 días sin regar',
      'Lleva 12 días sin regar',
      'Último análisis (grave): Podredumbre',
      'Último análisis (grave): Podredumbre',
    ])
  })

  it('respeta el límite pedido', async () => {
    const db = createMemoryDb()
    for (const nombre of ['Una', 'Dos', 'Tres', 'Cuatro', 'Cinco']) {
      const planta = await db.plants.create({ nombre, frecuenciaRiegoDias: 5 })
      await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(9) })
    }

    const todos = await db.reminders.attention()
    expect(todos).toHaveLength(5)
    // Todas con el mismo retraso, así que el desempate es por nombre.
    expect(todos.map((i) => i.plantNombre)).toEqual(['Cinco', 'Cuatro', 'Dos', 'Tres', 'Una'])

    const dos = await db.reminders.attention({ limite: 2 })
    expect(dos).toHaveLength(2)
    expect(dos.map((i) => i.plantId)).toEqual(todos.slice(0, 2).map((i) => i.plantId))

    expect(await db.reminders.attention({ limite: 0 })).toHaveLength(0)
    expect(await db.reminders.attention({ limite: 99 })).toHaveLength(5)
  })

  it('escribe los detalles en español y con frases concretas', async () => {
    const db = createMemoryDb()
    const vencida = await db.plants.create({ nombre: 'Seca', frecuenciaRiegoDias: 5 })
    const proxima = await db.plants.create({ nombre: 'Poto', frecuenciaRiegoDias: 5 })
    await db.plants.create({ nombre: 'Olvidada', frecuenciaRiegoDias: 5, fechaPlantado: plantadaHace(12) })

    await db.events.create({ plantId: vencida.id, tipo: 'riego', fecha: haceDias(14) })
    await db.events.create({ plantId: proxima.id, tipo: 'riego', fecha: haceDias(5) })

    const items = await db.reminders.attention()

    expect(items.map((i) => i.detalle)).toEqual([
      'Lleva 14 días sin regar',
      'Sin un solo riego en 12 días desde que la plantaste',
      'Toca regar hoy',
    ])
  })

  it('es determinista: dos llamadas seguidas devuelven la misma lista', async () => {
    const db = createMemoryDb()
    const planta = await db.plants.create({ nombre: 'Monstera', frecuenciaRiegoDias: 7 })
    await db.events.create({ plantId: planta.id, tipo: 'riego', fecha: haceDias(9) })
    await conAnalisis(db, planta.id, { veredicto: 'problema', gravedad: 'moderada', problema: 'Arañas' })

    const primera = await db.reminders.attention()
    const segunda = await db.reminders.attention()

    expect(primera).toEqual(segunda)
  })
})

describe('servicio montado sobre repositorios', () => {
  it('createReminderService devuelve estado y attention', () => {
    const db = createMemoryDb()
    const servicio = createReminderService({ plants: db.plants, events: db.events, analyses: db.analyses })

    expect(typeof servicio.estado).toBe('function')
    expect(typeof servicio.attention).toBe('function')
    expect(servicio.estado.length).toBeGreaterThanOrEqual(1)
  })

  it('no lanza si le piden el estado de una planta que no existe', async () => {
    const db = createMemoryDb()
    const s = await db.reminders.estado('no-existe', HOY)

    expect(s.plantId).toBe('no-existe')
    expect(s.frecuenciaDias).toBeNull()
    expect(s.estado).toBe('nunca_regada')
  })
})