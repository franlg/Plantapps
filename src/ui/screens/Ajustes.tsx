/**
 * AJUSTES
 * =======
 * Cinco bloques: la clave de la IA, los modelos, las copias de seguridad, la
 * instalación de la app y el aspecto. Abajo queda el sitio donde el usuario
 * recupera o borra las plantas que archivó, y el aviso de que todo vive en el
 * dispositivo y de que hay que exportar copias.
 *
 * Nada de lo que hay aquí sale del móvil: ni la clave ni las fotos.
 */

import { useRef, useState } from 'react'
import { useDb, usePlants, useSettings } from '@/db/context'
import { createBackupService } from '@/db'
import { precargarAjustes } from '@/services/ai'
import { useInstalable } from '@/services/pwa'
import { formatDateEs, nowIso, todayIso } from '@/lib/dates'
import {
  Button,
  Card,
  ConfirmDialog,
  ErrorBanner,
  Field,
  SegmentedControl,
  Select,
  Spinner,
  TextInput,
} from '@/ui/components'
import { Cabecera, Pantalla, TituloSeccion } from '@/ui/screens/Comunes'
import { OPCION_VACIA, avisoError, useTema } from '@/ui/screens/datos'
import type { AvisoError } from '@/ui/screens/datos'
import { MODELOS_GRATUITOS } from '@/types'
import type { ImportReport } from '@/services/contracts'

/** Versión que se muestra en «Acerca de». */
const VERSION = '1.0.0'

const ENLACE_CLAVE = 'https://aistudio.google.com/apikey'

const OPCIONES_MODELO = MODELOS_GRATUITOS.map((modelo) => ({ value: modelo.id, label: modelo.nombre }))

/** Lo que hay en `<input type="file">` en ese momento, ya leído y con un vistazo al formato. */
interface CopiaElegida {
  texto: string
  nombre: string
  /** `true` si el archivo lleva la marca de una copia de Plantapps. */
  esCopia: boolean
  /** Cuántas plantas dice traer, si se puede saber sin fallar. */
  plantas: number
}

/**
 * Lee el archivo y mira si es una copia nuestra antes de preguntar nada.
 * Si no lo es, el aviso lo dice: mejor que el usuario decida con la cabeza
 * fría que perder el historial por abrir el archivo equivocado.
 */
async function leerCopia(archivo: File): Promise<CopiaElegida> {
  const texto = await archivo.text()

  let esCopia = false
  let plantas = 0
  try {
    const datos: unknown = JSON.parse(texto)
    if (typeof datos === 'object' && datos !== null) {
      const registro = datos as { formato?: unknown; plants?: unknown }
      esCopia = registro.formato === 'plantapps-backup'
      plantas = Array.isArray(registro.plants) ? registro.plants.length : 0
    }
  } catch {
    // JSON inválido: no es una copia nuestra y ya se avisará al importar.
  }

  return { texto, nombre: archivo.name, esCopia, plantas }
}

export function Ajustes() {
  const db = useDb()
  const { settings, guardar } = useSettings()
  const { instalable, instalado, prompt } = useInstalable()
  const { tema, cambiarTema } = useTema()
  const todas = usePlants({ incluirArchivadas: true })
  const archivadas = todas.filter((planta) => planta.archivada)

  // --- Clave de la API -------------------------------------------------
  const [clave, setClave] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [guardandoClave, setGuardandoClave] = useState(false)
  const hayClave = (settings.apiKey ?? '').trim() !== ''

  // --- Copias de seguridad ---------------------------------------------
  const archivoRef = useRef<HTMLInputElement | null>(null)
  const [exportando, setExportando] = useState(false)
  const [pendiente, setPendiente] = useState<CopiaElegida | null>(null)
  const [importando, setImportando] = useState(false)
  const [informe, setInforme] = useState<ImportReport | null>(null)

  const [error, setError] = useState<AvisoError | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // --- Plantas archivadas ----------------------------------------------
  const [borrando, setBorrando] = useState<string | null>(null)

  const guardarClave = async () => {
    const valor = clave.trim()
    if (valor === '') return
    setGuardandoClave(true)
    setError(null)
    setAviso(null)
    try {
      await guardar({ apiKey: valor })
      // Para que el siguiente análisis no espere a releer los ajustes.
      await precargarAjustes()
      setClave('')
      setVerClave(false)
      setAviso('Clave guardada en este dispositivo.')
    } catch (problema) {
      setError(avisoError(problema, 'No se ha podido guardar la clave'))
    } finally {
      setGuardandoClave(false)
    }
  }

  const quitarClave = async () => {
    setGuardandoClave(true)
    setError(null)
    try {
      await guardar({ apiKey: '' })
      await precargarAjustes()
      setClave('')
      setAviso('Clave borrada de este dispositivo.')
    } catch (problema) {
      setError(avisoError(problema, 'No se ha podido borrar la clave'))
    } finally {
      setGuardandoClave(false)
    }
  }

  const exportar = async () => {
    setExportando(true)
    setError(null)
    setInforme(null)
    try {
      const copia = await createBackupService(db).exportAll()
      const texto = JSON.stringify(copia, null, 2)
      const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }))

      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = `plantapps-copia-${todayIso()}.json`
      document.body.appendChild(enlace)
      enlace.click()
      enlace.remove()
      URL.revokeObjectURL(url)

      await guardar({ ultimaCopia: nowIso() })
      setAviso(
        `Copia exportada: ${copia.plants.length} plantas y ${copia.events.length} registros.`,
      )
    } catch (problema) {
      setError(avisoError(problema, 'No se ha podido exportar la copia'))
    } finally {
      setExportando(false)
    }
  }

  const elegirArchivo = async (archivo: File) => {
    setError(null)
    setInforme(null)
    try {
      setPendiente(await leerCopia(archivo))
    } catch (problema) {
      setError(avisoError(problema, 'No se ha podido leer el archivo'))
    }
  }

  const confirmarImportacion = async () => {
    if (!pendiente) return
    setImportando(true)
    setError(null)
    try {
      const servicio = createBackupService(db)
      const resultado = await servicio.importAll(pendiente.texto, 'reemplazar')
      setInforme(resultado)
      setAviso(`Copia restaurada desde ${pendiente.nombre}.`)
      setPendiente(null)
    } catch (problema) {
      setError(avisoError(problema, 'No se ha podido importar la copia'))
      setPendiente(null)
    } finally {
      setImportando(false)
    }
  }

  const restaurar = async (id: string) => {
    setError(null)
    try {
      await db.plants.setArchivada(id, false)
      setAviso('Planta restaurada. Ya está en Inicio.')
    } catch (problema) {
      setError(avisoError(problema, 'No se ha podido restaurar la planta'))
    }
  }

  const borrarDefinitivo = async () => {
    if (!borrando) return
    const id = borrando
    setBorrando(null)
    try {
      await db.plants.remove(id)
      setAviso('Planta borrada con todo su historial.')
    } catch (problema) {
      setError(avisoError(problema, 'No se ha podido borrar la planta'))
    }
  }

  return (
    <Pantalla>
      <Cabecera titulo="Ajustes" detalle="Todo se guarda solo en este móvil." />

      {error ? (
        <div className="mb-4">
          <ErrorBanner title={error.titulo} message={error.mensaje} onDismiss={() => setError(null)} />
        </div>
      ) : null}

      {aviso ? (
        <p
          className="mb-4 rounded-2xl bg-ok-100 p-3 text-sm text-ok-800 dark:bg-ok-900 dark:text-ok-100"
          role="status"
        >
          <span aria-hidden="true">✅</span> {aviso}
        </p>
      ) : null}

      {/* ------------------------------------------------------------- */}
      {/* Clave de la API                                                */}
      {/* ------------------------------------------------------------- */}
      <TituloSeccion>Clave de la API de Gemini</TituloSeccion>
      <Card>
        <p className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--text)]">
          <span aria-hidden="true">{hayClave ? '✅' : '⚠️'}</span>
          {hayClave ? 'Clave configurada' : 'Falta la clave'}
        </p>

        {hayClave ? (
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            La clave está guardada en este dispositivo y no se muestra. Sustitúyela si te has quedado sin
            consultas o si crees que se ha Filtrado.
          </p>
        ) : (
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            Sin clave no hay análisis con IA. Todo lo demás sigue funcionando igual.
          </p>
        )}

        <form
          className="flex flex-col gap-3"
          onSubmit={(evento) => {
            evento.preventDefault()
            void guardarClave()
          }}
        >
          <Field
            label="Pega aquí tu clave"
            hint="Solo se guarda en este móvil. No se envía a ningún sitio."
            htmlFor="campo-clave"
          >
            <TextInput
              id="campo-clave"
              type={verClave ? 'text' : 'password'}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder="AIza..."
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </Field>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setVerClave((v) => !v)}>
              {verClave ? 'Ocultar' : 'Ver'}
            </Button>
            <Button type="submit" className="flex-1" loading={guardandoClave} disabled={clave.trim() === ''}>
              Guardar clave
            </Button>
          </div>
        </form>

        {hayClave ? (
          <Button variant="ghost" fullWidth className="mt-2" onClick={() => void quitarClave()}>
            Quitar la clave guardada
          </Button>
        ) : null}

        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Se consigue gratis en{' '}
          <a
            href={ENLACE_CLAVE}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-brand-700 underline dark:text-brand-300"
          >
            aistudio.google.com/apikey
          </a>
          . Crea una clave con «Create API key» y pégala aquí.
        </p>
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* Modelos                                                        */}
      {/* ------------------------------------------------------------- */}
      <TituloSeccion>Modelos</TituloSeccion>
      <Card className="flex flex-col gap-4">
        <Field label="Modelo principal" hint="El que se usa normalmente.">
          <Select
            options={OPCIONES_MODELO}
            value={settings.modelo}
            onChange={(e) => void guardar({ modelo: e.target.value })}
          />
        </Field>
        <Field label="Modelo de respaldo" hint="Si el principal falla o se queda sin cuota.">
          <Select
            options={[OPCION_VACIA, ...OPCIONES_MODELO]}
            value={settings.modeloFallback}
            onChange={(e) => void guardar({ modeloFallback: e.target.value })}
          />
        </Field>
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* Copia de seguridad                                             */}
      {/* ------------------------------------------------------------- */}
      <TituloSeccion>Copia de seguridad</TituloSeccion>
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          Un solo archivo JSON con tus plantas, sus riegos, sus análisis y las fotos. Guárdalo donde
          quieras (nube, correo, el móvil de alguien de confianza).
        </p>

        {settings.ultimaCopia ? (
          <p className="text-sm text-[var(--text-muted)]">
            Última copia: {formatDateEs(settings.ultimaCopia)}
          </p>
        ) : null}

        <Button variant="secondary" fullWidth loading={exportando} onClick={() => void exportar()}>
          Exportar copia
        </Button>

        <input
          ref={archivoRef}
          type="file"
          accept="application/json"
          aria-label="Archivo de copia de seguridad"
          className="sr-only"
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            e.target.value = ''
            if (archivo) void elegirArchivo(archivo)
          }}
        />
        <Button variant="secondary" fullWidth onClick={() => archivoRef.current?.click()}>
          Importar copia
        </Button>

        {informe ? (
          <p className="rounded-xl bg-brand-100 p-3 text-sm text-brand-900 dark:bg-brand-900 dark:text-brand-100">
            Restaurado: {informe.plants} plantas, {informe.events} registros, {informe.analyses}{' '}
            análisis y {informe.fotos} fotos.
          </p>
        ) : null}
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* Instalar                                                       */}
      {/* ------------------------------------------------------------- */}
      <TituloSeccion>Instalar la app</TituloSeccion>
      <Card>
        {instalado ? (
          <p className="text-base text-[var(--text)]">Ya la tienes instalada.</p>
        ) : instalable ? (
          <>
            <p className="mb-3 text-sm text-[var(--text-muted)]">
              Añádela a la pantalla de inicio para abrirla a pantalla completa y usarla sin navegador.
            </p>
            <Button fullWidth onClick={() => void prompt()}>
              Añadir a pantalla de inicio
            </Button>
          </>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Puedes instalarla desde el menú del navegador: «Añadir a la pantalla de inicio».
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* Apariencia                                                     */}
      {/* ------------------------------------------------------------- */}
      <TituloSeccion>Apariencia</TituloSeccion>
      <Card>
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          Empieza con el modo que tenga el móvil, pero puedes cambiarlo cuando quieras.
        </p>
        <SegmentedControl
          value={tema}
          options={[
            { value: 'claro', label: 'Claro' },
            { value: 'oscuro', label: 'Oscuro' },
          ]}
          onChange={(valor) => cambiarTema(valor)}
          ariaLabel="Tema de la aplicación"
        />
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* Plantas archivadas                                             */}
      {/* ------------------------------------------------------------- */}
      <TituloSeccion>Plantas archivadas</TituloSeccion>
      {archivadas.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">
            No hay ninguna archivada. Si archivas una planta desde su ficha, aparecerá aquí.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {archivadas.map((planta) => (
            <li key={planta.id}>
              <Card className="flex flex-col gap-3">
                <p className="text-base font-semibold text-[var(--text)]">
                  {planta.nombre}
                  {planta.especie ? (
                    <span className="font-normal text-[var(--text-muted)]"> · {planta.especie}</span>
                  ) : null}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => void restaurar(planta.id)}
                  >
                    Restaurar
                  </Button>
                  <Button variant="danger" onClick={() => setBorrando(planta.id)}>
                    Borrar
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Acerca de                                                      */}
      {/* ------------------------------------------------------------- */}
      <TituloSeccion>Acerca de</TituloSeccion>
      <Card className="flex flex-col gap-2">
        <p className="text-base font-semibold text-[var(--text)]">Plantapps {VERSION}</p>
        <p className="text-sm text-[var(--text-muted)]">
          Tus plantas, tus fotos y tu clave de la IA se guardan solo en este dispositivo. No hay cuentas
          ni servidores: nadie más que tú puede verlos.
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          Si borras los datos del navegador o desinstalas la app, se pierde todo. Exporta una copia de
          seguridad de vez en cuando.
        </p>
      </Card>

      {borrando ? (
        <ConfirmDialog
          open={true}
          title="¿Borrar para siempre?"
          message="Se borra la planta, sus riegos, sus comentarios y sus análisis. Si solo quieres quitarla de la lista, restáurala."
          confirmLabel="Sí, borrar"
          cancelLabel="Cancelar"
          onConfirm={() => void borrarDefinitivo()}
          onCancel={() => setBorrando(null)}
          destructive
        />
      ) : null}

      <ConfirmDialog
        open={pendiente !== null}
        title={pendiente?.esCopia ? '¿Restaurar esta copia?' : 'Este archivo no parece una copia'}
        message={
          pendiente?.esCopia
            ? `«${pendiente.nombre}» trae ${pendiente.plantas} ${pendiente.plantas === 1 ? 'planta' : 'plantas'}. Al restaurar se borra todo lo que hay ahora en la app: lo que tengas sin exportar se pierde.`
            : `«${pendiente?.nombre ?? 'El archivo'}» no lleva la marca de una copia de Plantapps. Si continúas, se borrará lo que hay ahora y, si el archivo no es válido, no se importará nada.`
        }
        confirmLabel="Sí, restaurar"
        cancelLabel="Cancelar"
        onConfirm={() => void confirmarImportacion()}
        onCancel={() => setPendiente(null)}
        destructive
      />

      {importando ? (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center">
          <Spinner label="Restaurando la copia" />
        </div>
      ) : null}
    </Pantalla>
  )
}