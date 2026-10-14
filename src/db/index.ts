import type { Db } from '@/services/contracts'
import { createMemoryDb } from './memory'
import { createIndexedDb } from './dexie'

/**
 * Instancia única de la base de datos de la app.
 *
 * En el navegador, y en los tests con `fake-indexeddb`, se usa IndexedDB con Dexie
 * (los datos y las fotos sobreviven a la recarga). Si el entorno no tiene
 * IndexedDB —tests en jsdom sin `fake-indexeddb`— se cae a la implementación en
 * memoria, que cumple el mismo contrato `Db`.
 */
export const db: Db = typeof indexedDB !== 'undefined' ? createIndexedDb() : createMemoryDb()

export * from './context'
export { createMemoryDb } from './memory'
export { createIndexedDb } from './dexie'
export { createBackupService } from './backup'
