/**
 * PWA
 * ===
 * Todo lo relacionado con "ser una app de verdad en el móvil":
 *
 * - `registrarServiceWorker()`  se llama UNA vez al arrancar (`src/main.tsx`).
 * - `useActualizacion()`        avisa de que hay una versión nueva.
 * - `useInstalable()`           ofrece el botón de "Añadir a pantalla de inicio".
 * - `useOnline()`               avisa de que no hay red (solo afecta a la IA).
 *
 * ```ts
 * import { registrarServiceWorker, useActualizacion, useInstalable, useOnline } from '@/services/pwa'
 * ```
 */

export { registrarServiceWorker, RUTA_SERVICE_WORKER } from './registro'
export { useActualizacion, TIMEOUT_RECARGA_MS, contenedorServiceWorker } from './useActualizacion'
export type { EstadoActualizacion } from './useActualizacion'
export { useInstalable, puedeInstalarse, detectarInstalada } from './instalabilidad'
export type { EstadoInstalable, EventoBeforeInstallPrompt, EleccionInstalacion } from './instalabilidad'
export { useOnline } from './offline'