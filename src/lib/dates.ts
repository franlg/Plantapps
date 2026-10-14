import {
  differenceInCalendarDays,
  format,
  formatDistanceStrict,
  isValid,
  parseISO,
} from 'date-fns'
import { es } from 'date-fns/locale'

export const MS_PER_DAY = 86_400_000

/** ISO datetime del instante actual. */
export function nowIso(): string {
  return new Date().toISOString()
}

/** Fecha local en formato `YYYY-MM-DD` (no UTC, para que no se desplace un día). */
export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** ISO datetime a partir de una fecha `YYYY-MM-DD`, a mediodía (evita saltos de zona horaria). */
export function fromIsoDate(value: string): Date {
  const d = parseISO(`${value}T12:00:00`)
  return isValid(d) ? d : new Date()
}

/** Fecha `YYYY-MM-DD` de un instante (en hora local). */
export function toIsoDate(value: Date | string): string {
  const d = typeof value === 'string' ? parseISO(value) : value
  return format(isValid(d) ? d : new Date(), 'yyyy-MM-dd')
}

/** Convierte cualquier entrada a Date. Si no es válida, devuelve la fecha actual. */
export function toDate(value: Date | string | number | null | undefined): Date {
  if (value == null) return new Date()
  const d = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : parseISO(value)
  return isValid(d) ? d : new Date()
}

/** Días de calendario entre dos fechas (b - a). Positivo si b es posterior. */
export function daysBetween(a: Date | string, b: Date | string = new Date()): number {
  return differenceInCalendarDays(toDate(b), toDate(a))
}

/** Días transcurridos desde `value` hasta ahora. Negativo si `value` está en el futuro. */
export function daysSince(value: Date | string | null | undefined, now: Date = new Date()): number | null {
  if (value == null) return null
  return differenceInCalendarDays(toDate(now), toDate(value))
}

/** '14 oct 2026' */
export function formatDateEs(value: Date | string): string {
  return format(toDate(value), 'd MMM yyyy', { locale: es })
}

/** '14 oct 2026, 18:30' */
export function formatDateTimeEs(value: Date | string): string {
  return format(toDate(value), "d MMM yyyy, HH:mm", { locale: es })
}

/** 'hace 3 días' (también 'en 2 días' si la fecha es futura). */
export function relativeEs(value: Date | string | null | undefined, now: Date = new Date()): string {
  if (value == null) return 'nunca'
  return formatDistanceStrict(toDate(value), toDate(now), { locale: es, addSuffix: true })
}

/** Alias de relativeEs, para dejar claro el uso en la interfaz. */
export function relativeToNowEs(value: Date | string | null | undefined, now: Date = new Date()): string {
  return relativeEs(value, now)
}

/** Valor para <input type="date"> a partir de un instante ISO. */
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return ''
  return toIsoDate(value)
}

/** Instante ISO a partir del valor de un <input type="date">, con la hora indicada. */
export function fromDateInputValue(value: string, hora = '12:00'): string {
  if (!value) return nowIso()
  const d = parseISO(`${value}T${hora}:00`)
  return isValid(d) ? d.toISOString() : nowIso()
}

/** Texto corto para una duración en días: '3 días', '1 día', 'hoy'. */
export function daysLabel(days: number | null): string {
  if (days == null) return '—'
  if (days === 0) return 'hoy'
  if (days === 1) return '1 día'
  if (days === -1) return '1 día de retraso'
  if (days < 0) return `${Math.abs(days)} días de retraso`
  return `${days} días`
}