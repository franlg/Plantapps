/**
 * ARMAZÓN DE LA APP
 * =================
 * Router + las dos franjas de arriba (versión nueva y sin conexión) + la barra
 * de navegación de abajo.
 *
 * Las franjas viven aquí, y no en cada pantalla, para que se comporten igual en
 * todas: si pierdes la conexión en la ficha de una planta, te avisas igual que
 * si la pierdes en Inicio.
 */

import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { useDb } from '@/db/context'
import { useActualizacion, useOnline } from '@/services/pwa'
import { Button, Spinner } from '@/ui/components'
import { Franja } from '@/ui/screens/Comunes'
import { BarraNavegacion, RutasApp } from '@/ui/navegacion'

/**
 * `true` cuando la base de datos ha contestado al menos una vez.
 * Hasta entonces no se pinta nada: mostrar plantas vacías y que luego aparezcan
 * da la sensación de que los datos se han perdido.
 */
function useDatosListos(): boolean {
  const db = useDb()
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let vivo = true
    const listoYa = () => {
      if (vivo) setListo(true)
    }
    void db.settings.get().then(listoYa, listoYa)
    return () => {
      vivo = false
    }
  }, [db])

  return listo
}

function Cargando() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner size="lg" label="Abriendo la app" className="text-[var(--text-muted)]" />
    </div>
  )
}

function Marco() {
  const listo = useDatosListos()
  const online = useOnline()
  const { hayActualizacion, actualizar } = useActualizacion()

  if (!listo) return <Cargando />

  return (
    <div className="min-h-dvh">
      {hayActualizacion || !online ? (
        // Una sola cajita para las dos franjas: si cada una se pegase por su
        // cuenta al borde, se taparían al hacer scroll.
        <div className="sticky top-0 z-50">
          {hayActualizacion ? (
            <Franja tono="marca">
              <span>Hay una versión nueva de la app.</span>
              <Button size="sm" variant="secondary" onClick={actualizar}>
                Actualizar
              </Button>
            </Franja>
          ) : null}

          {online ? null : (
            <Franja tono="alerta">
              <span>Sin conexión. Puedes registrar riegos, pero la IA no funciona.</span>
            </Franja>
          )}
        </div>
      ) : null}

      <RutasApp />
      <BarraNavegacion />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Marco />
    </BrowserRouter>
  )
}