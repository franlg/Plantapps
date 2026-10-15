/**
 * CÁLCULO DE AVISOS
 * =================
 * Decide **qué avisos hay que programar** y **cuándo** suena cada uno. Es una
 * función pura y sin reloj propio: el instante de referencia (`now`) entra por
 * parámetro, así que los tests no dependen de la hora real y el mismo estado
 * siempre da la misma lista.
 *
 * Nada aquí lanza ni muestra nada: solo se calcula. De enseñarlos se encarga
 * `recordatorioScheduler` (`./index.ts`) y de guardarlos en el service worker,
 * `public/sw.js`.
 */

import type { Db } from '@/services/contracts'
import type { ConfigRecordatorios, RecordatorioProgramado, WateringStatus } from '@/types'
import { addDays, set } from 'date-fns'

/** Hora usada si en los ajustes hay algo que no parece una hora (`HH:mm`). */
const HORA_POR_DEFECTO = 9

/**
 * Nadie necesita que le avisen con más de un año de antelación, y un valor
 * disparatado (un `9999` tecleado sin querer) haría que la fecha se saliera del
 * rango cómodo de `Date`. Se recorta aquí y no se pierde ningún aviso real.
 */
const ANTICIPACION_MAXIMA = 365

/**
 * Días desde hoy hasta el día en que toca regar.
 *
 * El motor de riego ya lo trae resuelto en `diasParaRiego`; solo hay que
 * cubrir el caso de una planta que aún no ha recibido un solo riego, donde la
 * referencia es la fecha de plantación. Si tampoco se sabe cuándo se plantó no
 * hay ninguna fecha con sentido, y se devuelve `null`: mejor no avisar que
 * inventar un día.
 */
function diasParaRiego(s: WateringStatus, ciclo: number): number | null {
  if (s.diasParaRiego != null) return s.diasParaRiego
  if (s.diasDesdePlantado == null) return null
  return ciclo - s.diasDesdePlantado
}

/** '1 día' / '2 días', sin decimales ni negativos. */
function pluralDias(dias: number): string {
  return dias === 1 ? '1 día' : `${dias} días`
}

/**
 * Cuerpo del aviso, en castellano llano y en concreto: qué tiene que hacer la
 * persona, no un "recordatorio genérico".
 */
function cuerpoAviso(s: WateringStatus, diasPara: number): string {
  if (diasPara < 0) {
    const retraso = s.diasDesdeRiego ?? -diasPara
    return retraso > 0 ? `Lleva ${pluralDias(retraso)} sin regar` : 'Se le pasó la fecha de riego'
  }
  if (diasPara === 0) return 'Toca regar hoy'
  if (diasPara === 1) return 'Toca regar mañana'
  return `Toca regar en ${pluralDias(diasPara)}`
}

/** Título del aviso: siempre se sabe de qué planta se trata. */
function tituloAviso(nombre: string, diasPara: number): string {
  return `${nombre}: ${diasPara < 0 ? 'necesita agua' : 'toca regar'}`
}

/** Convierte la `hora` de los ajustes (`HH:mm`) en horas y minutos. */
function partesHora(hora: string): { horas: number; minutos: number } {
  const coincide = /^(\d{1,2}):(\d{2})$/.exec(hora?.trim() ?? '')
  if (!coincide) return { horas: HORA_POR_DEFECTO, minutos: 0 }

  const horas = Number(coincide[1])
  const minutos = Number(coincide[2])
  const horasOk = Number.isInteger(horas) && horas >= 0 && horas <= 23
  const minutosOk = Number.isInteger(minutos) && minutos >= 0 && minutos <= 59
  return { horas: horasOk ? horas : HORA_POR_DEFECTO, minutos: minutosOk ? minutos : 0 }
}

/** Días de antelación válidos: enteros de 0 a un año. */
function antcipacionValida(dias: number): number {
  if (!Number.isFinite(dias)) return 0
  return Math.min(ANTICIPACION_MAXIMA, Math.max(0, Math.trunc(dias)))
}

/**
 * Instante en que debe sonar el aviso.
 *
 * Se busca el día del riego, se retrasa lo que marque `anticipacion` y se pone
 * la hora de los ajustes. Si ese momento ya pasó (por ejemplo, porque la planta
 * lleva semanas sin regar), se salta de ciclo en ciclo hasta llegar al futuro:
 * así el aviso no se pierde, simplemente salta al siguiente riego previsto.
 */
function instanteDelAviso(
  ahora: Date,
  diasPara: number,
  anticipacion: number,
  horas: number,
  minutos: number,
  ciclo: number,
): Date {
  const aLaHora = (dia: Date): Date =>
    set(dia, { hours: horas, minutes: minutos, seconds: 0, milliseconds: 0 })

  const primero = aLaHora(addDays(ahora, diasPara - anticipacion))
  if (primero.getTime() > ahora.getTime()) return primero

  // El primer candidato ya pasó: se calcula de golpe cuántos ciclos hacen falta
  // (un `while` aquí tardaría eones si la anticipación fuera enorme).
  const diasQueFaltan = Math.ceil((ahora.getTime() - primero.getTime()) / 86_400_000)
  const ciclos = Math.max(1, Math.ceil(diasQueFaltan / ciclo))

  let instante = addDays(primero, ciclos * ciclo)
  // Red de seguridad: por un cambio de hora en el calendario el resultado puede
  // quedar justo en `ahora`, y un aviso en el pasado no sirve de nada.
  while (instante.getTime() <= ahora.getTime()) instante = addDays(instante, ciclo)
  return instante
}

/**
 * Avisos de riego que hay que tener programados ahora mismo.
 *
 * Recibe la lista **completa** de plantas no archivadas y devuelve solo los
 * avisos que faltan por sonar, ordenados por fecha. Si el interruptor está
 * apagado o no hay plantas, la lista es vacía (y el que llame se encargará de
 * cancelar lo que hubiera).
 *
 * @param db    Base de datos de la app (solo lectura: aquí no se escribe nada).
 * @param config Ajustes de recordatorios (`AppSettings.recordatorios`).
 * @param now   Instante de referencia. Por defecto, el de ahora.
 */
export async function calcularAvisos(
  db: Db,
  config: ConfigRecordatorios,
  now: Date = new Date(),
): Promise<RecordatorioProgramado[]> {
  if (!config.activos) return []

  const plantas = await db.plants.list()
  if (plantas.length === 0) return []

  const anticipacion = antcipacionValida(config.diasAnticipacion)
  const { horas, minutos } = partesHora(config.hora)
  const avisos: RecordatorioProgramado[] = []

  // Un único instante para todas las plantas: si el cálculo cruzase la medianoche,
  // dos plantas de la misma lista no se evaluarían en el mismo día.
  for (const planta of plantas) {
    const s = await db.reminders.estado(planta.id, now)
    const ciclo = Number.isFinite(s.frecuenciaDias ?? Number.NaN) ? Math.max(1, Math.trunc(s.frecuenciaDias ?? 1)) : 0
    // Sin ciclo de riego no hay fecha que anticipar: la planta se queda sin aviso.
    if (ciclo < 1) continue

    const diasPara = diasParaRiego(s, ciclo)
    if (diasPara == null) continue

    const para = instanteDelAviso(now, diasPara, anticipacion, horas, minutos, ciclo)
    if (!Number.isFinite(para.getTime()) || para.getTime() <= now.getTime()) continue

    avisos.push({
      // Id estable: la misma planta y el mismo instante siempre dan el mismo id,
      // así que un aviso repetido sustituye al anterior en lugar de apilarse.
      id: `${planta.id}:${para.toISOString()}`,
      plantId: planta.id,
      titulo: tituloAviso(planta.nombre, diasPara),
      cuerpo: cuerpoAviso(s, diasPara),
      para: para.toISOString(),
    })
  }

  avisos.sort((a, b) => a.para.localeCompare(b.para) || a.plantId.localeCompare(b.plantId))
  return avisos
}