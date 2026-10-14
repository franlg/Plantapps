import type { BackupService, Db } from '@/services/contracts'

/**
 * MARCADOR. Lo implementa el agente de datos (@/src/db) sobre la interfaz `Db`.
 */
export function createBackupService(_db: Db): BackupService {
  return {
    async exportAll() {
      throw new Error('La copia de seguridad todavía no está implementada')
    },
    async importAll() {
      throw new Error('La copia de seguridad todavía no está implementada')
    },
  }
}