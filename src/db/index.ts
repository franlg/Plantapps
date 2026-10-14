import type { Db } from '@/services/contracts'
import { createMemoryDb } from './memory'

/**
 * Instancia única de la base de datos de la app.
 *
 * Ahora mismo es en memoria. El agente de persistencia la sustituirá por la
 * implementación con Dexie/IndexedDB respetando la misma interfaz `Db`.
 */
export const db: Db = createMemoryDb()

export * from './context'
export { createMemoryDb } from './memory'