import type { RecordatorioScheduler, EstadoPlanificador, RecordatorioProgramado, PermisoNotificaciones } from '@/types'

/**
 * MARCADOR. Lo sustituye el agente de recordatorios con la implementación real
 * (permiso de notificaciones + programación vía service worker).
 *
 * La interfaz `RecordatorioScheduler` ya está congelada en `@/types`, así que la
 * pantalla de Ajustes puede programarse contra ella desde ya.
 */

/** Explicación honesta de la limitación, reutilizable en la interfaz. */
export const AVISO_LIMITACION =
  'Android puede cerrar la app en segundo plano y entonces el aviso no llegará. Dentro de la app siempre te avisamos; para que suene fuera, deja la app abierta en un pest��ño o vuelve a entrar de vez en cuando.'

/** Sin soporte de notificaciones: no romper nunca la app por esto. */
const NO_SOPORTADO: EstadoPlanificador = {
  permiso: 'no-soportado',
  programados: 0,
  persistentes: false,
  aviso: 'Este navegador no admite notificaciones.',
}

export function createRecordatorioScheduler(): RecordatorioScheduler {
  return {
    async estado(): Promise<EstadoPlanificador> {
      if (typeof window === 'undefined' || !('Notification' in window)) return NO_SOPORTADO
      return {
        permiso: Notification.permission as PermisoNotificaciones,
        programados: 0,
        persistentes: 'serviceWorker' in navigator,
      }
    },
    async pedirPermiso(): Promise<PermisoNotificaciones> {
      if (typeof window === 'undefined' || !('Notification' in window)) return 'no-soportado'
      try {
        return (await Notification.requestPermission()) as PermisoNotificaciones
      } catch {
        return 'denied'
      }
    },
    async sincronizar(_items: RecordatorioProgramado[]): Promise<number> {
      return 0
    },
    async cancelarTodos(): Promise<void> {
      /* sin implementar */
    },
    async probar(): Promise<void> {
      /* sin implementar */
    },
  }
}

export const recordatorioScheduler: RecordatorioScheduler = createRecordatorioScheduler()