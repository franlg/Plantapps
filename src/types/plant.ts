/** Identificador único. Se genera con crypto.randomUUID(). */
export type ID = string

/** Exposición de luz estimada de la planta. */
export type Luz = 'sol_directo' | 'sol_indirecto' | 'sombra' | 'interior'

/**
 * Una planta de casa.
 *
 * OJO: aquí no hay ningún campo `ultimoRiego`. El último riego es un hecho del
 * historial, no un dato de la planta: se guarda como un `CareEvent` de tipo
 * 'riego' y se consulta con `db.events.ultimoRiego(plantId)`, que es lo que usan
 * los recordatorios y la ficha de la planta.
 */
export interface Plant {
  id: ID
  /** Nombre que le pongo yo, ej. "Monstera del salón". */
  nombre: string
  /** Especie, ej. "Monstera deliciosa". Opcional. */
  especie?: string
  /** Fecha en la que la planté, ISO `YYYY-MM-DD`. Opcional. */
  fechaPlantado?: string
  /** Objetivo de días entre riegos. Si no lo pongo, se calcula a partir de la especie. */
  frecuenciaRiegoDias?: number
  /** Texto libre, ej. "maceta 18 cm", "5 L de sustrato". */
  maceta?: string
  /** Texto libre, ej. "sala, junto a la ventana". */
  ubicacion?: string
  luz?: Luz
  notas?: string
  /** Referencia a una foto almacenada (ver StoredPhoto). */
  fotoPortadaId?: ID
  archivada: boolean
  /** ISO datetime. */
  creadoEn: string
  /** ISO datetime. */
  actualizadoEn: string
}

/** Campos que puede rellenar el usuario al crear una planta. */
export type NewPlant = Partial<Omit<Plant, 'id' | 'creadoEn' | 'actualizadoEn' | 'archivada'>> &
  Pick<Plant, 'nombre' | 'fechaPlantado'>

export const LUZ_LABELS: Record<Luz, string> = {
  sol_directo: 'Sol directo',
  sol_indirecto: 'Sol indirecto',
  sombra: 'Sombra',
  interior: 'Interior',
}