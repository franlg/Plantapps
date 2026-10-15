import type { ID } from './plant'

/** Permiso que concede el usuario a las notificaciones. */
export type PermisoNotificaciones = 'granted' | 'denied' | 'default' | 'no-soportado'

export const PERMISO_LABELS: Record<PermisoNotificaciones, string> = {
  granted: 'Activados',
  denied: 'Bloqueados',
  default: 'Sin decidir',
  'no-soportado': 'No disponible en este navegador',
}

/** Ajustes de recordatorios, dentro de `AppSettings`. */
export interface ConfigRecordatorios {
  /** Interruptor maestro. */
  activos: boolean
  /** Hora local del aviso, `HH:mm`. */
  hora: string
  /** Cuántos días antes del riego se avisa. 0 = el día que toca. */
  diasAnticipacion: number
}

export const CONFIG_RECORDATORIOS_POR_DEFECTO: ConfigRecordatorios = {
  activos: false,
  hora: '09:00',
  diasAnticipacion: 0,
}

/** Un aviso concreto ya programado. */
export interface RecordatorioProgramado {
  /** Identificador estable: `${plantId}:${iso}`. Permite reprogramar sin duplicar. */
  id: string
  plantId: ID
  titulo: string
  cuerpo: string
  /** Instante exacto del aviso, ISO datetime. */
  para: string
}

/** Estado que devuelve el planificador para mostrarlo en Ajustes. */
export interface EstadoPlanificador {
  permiso: PermisoNotificaciones
  /** Cuántos avisos hay programados ahora mismo. */
  programados: number
  /** `true` si los avisos sobreviven a cerrar la app. */
  persistentes: boolean
  /** Explicación honesta de la limitación, para mostrarla en la interfaz. */
  aviso?: string
}

/** Servicio que programa los avisos. Puede fallar sin romper la app. */
export interface RecordatorioScheduler {
  /** Lee el permiso actual. Nunca lanza. */
  estado(): Promise<EstadoPlanificador>
  /** Pide el permiso al usuario. Nunca lanza. */
  pedirPermiso(): Promise<PermisoNotificaciones>
  /**
   * Programa los avisos indicados y cancela los que ya no apliquen.
   * Recibe la lista **completa**: lo que no esté, se cancela.
   */
  sincronizar(items: RecordatorioProgramado[]): Promise<number>
  /** Cancela todos los avisos. */
  cancelarTodos(): Promise<void>
  /** Lanza un aviso de prueba para comprobar que el permiso funciona. */
  probar(): Promise<void>
}