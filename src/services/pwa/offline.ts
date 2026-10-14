/**
 * ESTADO DE CONEXIÓN
 * ==================
 * Lo único que necesita internet es el análisis con IA. Todo lo demás (plantas,
 * riegos, fotos) vive en IndexedDB. Con este hook la interfaz puede avisar de
 * "Sin conexión: los análisis con IA no estarán disponibles" sin preguntar nada.
 *
 * `navigator.onLine` solo sabe si hay red teórica (en un móvil eso puede no ser
 * internet de verdad), pero para decidir si conviene ocultar el botón de IA es
 * más que suficiente.
 */

import { useEffect, useState } from 'react'

/**
 * ¿Hay conexión? Empieza con `navigator.onLine` y se actualiza sola con los
 * eventos `online` y `offline`, que el navegador emite en `window`.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return true
    return navigator.onLine !== false
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const alOnline = () => setOnline(true)
    const alOffline = () => setOnline(false)

    window.addEventListener('online', alOnline)
    window.addEventListener('offline', alOffline)

    return () => {
      window.removeEventListener('online', alOnline)
      window.removeEventListener('offline', alOffline)
    }
  }, [])

  return online
}