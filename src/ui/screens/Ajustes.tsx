/**
 * AJUSTES
 * =======
 * Cinco bloques: la clave de la IA, los modelos, las copias de seguridad, la
 * instalación de la app y el aspecto. A eso se suma el bloque de recordatorios
 * de riego (el aviso del sistema, que se programa aparte del "Requieren
 * atención"). Abajo queda el sitio donde el usuario recupera o borra las plantas
 * que archivó, y el aviso de que todo vive en el dispositivo y de que hay que
 * exportar copias.
 *
 * Nada de lo que hay aquí sale del móvil: ni la clave ni las fotos.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDb, usePlants, useSettings } from '@/db/context'
import { createBackupService } from '@/db'
import { precargarAjustes } from '@/services/ai'
import {
  AVISO_BLOQUEADO,
  AVISO_LIMITACION,
  AVISO_NO_SOPORTADO,
  calcularAvisos,
  recordatorioScheduler,
} from '@/services/recordatorios'
import { useInstalable } from '@/services/pwa'
import { formatDateEs, nowIso, todayIso } from '@/lib/dates'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorBanner,
  Field,
  Interruptor,
  SegmentedControl,
  Select,
  Spinner,
  TextInput,
} from '@/ui/components'
import { Cabecera, Pantalla, TituloSeccion } from '@/ui/screens/Comunes'
import { OPCION_VACIA, avisoError, useTema } from '@/ui/screens/datos'
import type { AvisoError } from '@/ui/screens/datos'
import { MODELOS_GRATUITOS, PERMISO_LABELS } from '@/types'
import type {
  ConfigRecordatorios,
  EstadoPlanificador,
  PermisoNotificaciones,
} from '@/types'
import type { BadgeTone } from '@/ui/components'
import type { ImportReport } from '@/services/contracts'

/** Versión que se muestra en «Acerca de». */
const VERSION = '1.0.0'

const ENLACE_CLAVE = 'https://aistudio.google.com/apikey'

const OPCIONES_MODELO = MODELOS_GRATUITOS.map((modelo) => ({ value: modelo.id, label: modelo.nombre }))

// ---------------------------------------------------------------------------
// Recordatorios de riego
// ---------------------------------------------------------------------------

/**
 * Tono de la pastilla de permiso: verde si puede, rojo si lo ha bloqueado,
 * ámbar si todavía no ha decidido y gris si el navegador no puede avisar.
 */
const TONO_PERMISO: Record<PermisoNotificaciones, BadgeTone> = {
  granted: 'ok',
  denied: 'peligro',
  default: 'alerta',
  'no-soportado': 'neutro',
}

const OPCIONES_ANTICIPACION = [
  { value: '0', label: 'El mismo día' },
  { value: '1', label: '1 día antes' },
  { value: '2', label: '2 días antes' },
]

/**
 * Cómo volver a encender unas notificaciones ya bloqueadas. En un enlace como
 * `chrome://settings/notifications` no se puede entrar desde Android, así que la
 * pista tiene que ser texto: la ruta de los ajustes del móvil.
 */
const COMO_REACTIVAR =
  'Abre los ajustes de tu móvil → Apps → Chrome → Notificaciones y vuelve a activar los avisos de Plantapps.'

/** `HH:mm` es lo único que acepta el input de hora; nada más se guarda. */
const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/

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

  // --- Recordatorios de riego -------------------------------------------
  const { activos, hora, diasAnticipacion } = settings.recordatorios
  /** Los tres campos sueltos, agrupados: así el efecto de sincronizar no se relanza solo. */
  const config = useMemo<ConfigRecordatorios>(
    () => ({ activos, hora, diasAnticipacion }),
    [activos, hora, diasAnticipacion],
  )

  const [estado, setEstado] = useState<EstadoPlanificador | null>(null)
  const [programados, setProgramados] = useState<number | null>(null)
  const [pidiendoPermiso, setPidiendoPermiso] = useState(false)
  const [probando, setProbando] = useState(false)
  const [errorAvisos, setErrorAvisos] = useState<AvisoError | null>(null)
  /** Cuántas veces ha vuelto la app al primer plano: obliga a rearar los avisos. */
  const [vueltas, setVueltas] = useState(0)

  /**
   * Lo que dice el navegador. Hasta que responda se asume lo prudente
   * (`'default'`: ni sí ni no), aunque esa parte de la pantalla no se pinta
   * hasta tener la respuesta de verdad.
   */
  const permiso: PermisoNotificaciones = estado?.permiso ?? 'default'
  const soportado = estado?.permiso !== 'no-soportado'
  const puedeAvisar = permiso === 'granted'

  const leerEstado = useCallback(async () => {
    const siguiente = await recordatorioScheduler.estado()
    setEstado(siguiente)
    setProgramados(siguiente.programados)
  }, [])

  useEffect(() => {
    let vivo = true
    void recordatorioScheduler.estado().then((siguiente) => {
      if (!vivo) return
      setEstado(siguiente)
      setProgramados(siguiente.programados)
    })
    return () => {
      vivo = false
    }
  }, [])

  /*
   * Al volver a primer plano se relee el estado y se rearma lo que haga falta.
   * Android puede haber cerrado el service worker mientras no mirábamos, y los
   * avisos que tenía armada se habrían quedado viejos o directamente perdidos.
   *
   * El contador está en el estado a propósito: si el permiso sigue siendo el
   * mismo, releerlo no cambia nada y los avisos se quedarían sin rearmar. Subir
   * el contador fuerza la resincronización aunque todo lo demás siga igual.
   */
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      setVueltas((vueltas) => vueltas + 1)
      void leerEstado()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [leerEstado])

  /*
   * Cada vez que cambian los ajustes (o el permiso) se manda la lista COMPLETA
   * de avisos: lo que no esté en ella se cancela. Por eso se vuelve a calcular
   * entera en vez de añadir solo lo nuevo.
   */
  useEffect(() => {
    if (!activos || !puedeAvisar) return
    let vivo = true

    void calcularAvisos(db, config)
      .then((avisos) => recordatorioScheduler.sincronizar(avisos))
      .then((total) => {
        if (vivo) setProgramados(total)
      })
      .catch((problema: unknown) => {
        if (vivo) setErrorAvisos(avisoError(problema, 'No se han podido programar los avisos'))
      })

    return () => {
      vivo = false
    }
  }, [db, config, activos, puedeAvisar, vueltas])

  /**
   * Guarda **un trozo** de la configuración. Se manda el objeto entero porque
   * `recordatorios` vive dentro de `AppSettings`: si se guardara solo el campo
   * cambiado, `settings.save` lo sustituiría entero y se perderían los otros dos.
   */
  const guardarRecordatorios = async (cambio: Partial<ConfigRecordatorios>) => {
    setErrorAvisos(null)
    try {
      await guardar({ recordatorios: { ...config, ...cambio } })
    } catch (problema) {
      setErrorAvisos(avisoError(problema, 'No se ha podido guardar el ajuste'))
    }
  }

  const pedirPermiso = async () => {
    setPidiendoPermiso(true)
    setErrorAvisos(null)
    try {
      await recordatorioScheduler.pedirPermiso()
      await leerEstado()
    } finally {
      setPidiendoPermiso(false)
    }
  }

  const probar = async () => {
    setProbando(true)
    setErrorAvisos(null)
    try {
      await recordatorioScheduler.probar()
      setAviso('Aviso de prueba enviado: debería aparecer ya como notificación.')
    } catch (problema) {
      setErrorAvisos(avisoError(problema, 'No se ha podido probar la notificación'))
    } finally {
      setProbando(false)
    }
  }

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
      {/* Recordatorios de riego                                          */}
      {/* ------------------------------------------------------------- */}
      <TituloSeccion>Recordatorios de riego</TituloSeccion>
      <Card className="flex flex-col gap-4">
        {estado === null ? (
          <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
            <Spinner size="sm" label="Comprobando si este navegador puede avisar" />
            <span>Comprobando si este navegador puede avisar…</span>
          </div>
        ) : (
          <>
            {/* Interruptor maestro + permiso, siempre a la vista. */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-[var(--text)]">
                  Avisarme cuando toque regar
                </p>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  {soportado
                    ? 'Un aviso del sistema con el nombre de la planta y lo que toca hacer.'
                    : 'No se puede: este navegador no sabe mostrar avisos.'}
                </p>
              </div>
              <Interruptor
                activo={activos}
                etiqueta="Avisarme cuando toque regar"
                deshabilitado={!soportado}
                onChange={(siguiente) => void guardarRecordatorios({ activos: siguiente })}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">Notificaciones</span>
              <Badge tone={TONO_PERMISO[permiso]}>{PERMISO_LABELS[permiso]}</Badge>
            </div>

            {permiso === 'default' ? (
              <Button
                variant="secondary"
                fullWidth
                loading={pidiendoPermiso}
                onClick={() => void pedirPermiso()}
              >
                Permitir notificaciones
              </Button>
            ) : null}

            {permiso === 'denied' ? (
              <p className="text-sm leading-relaxed text-peligro-700 dark:text-peligro-200">
                {AVISO_BLOQUEADO} {COMO_REACTIVAR}
              </p>
            ) : null}

            {permiso === 'no-soportado' ? (
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">{AVISO_NO_SOPORTADO}</p>
            ) : null}

            {/* Hora y antelación: qué se guarda y cuánto antes suena. */}
            <div className="flex flex-col gap-4">
              <Field
                label="Hora del aviso"
                hint="La hora local de este móvil. Dentro de la app los avisos salen a cualquier hora."
                htmlFor="campo-hora-recordatorio"
              >
                <input
                  id="campo-hora-recordatorio"
                  type="time"
                  value={hora}
                  disabled={!soportado}
                  step={300}
                  onChange={(e) => {
                    const valor = e.target.value
                    // El input deja el campo vacío mientras se teclea: eso no
                    // es una hora y no se guarda para no romper el cálculo.
                    if (HORA_VALIDA.test(valor)) void guardarRecordatorios({ hora: valor })
                  }}
                  className="campo max-w-[12rem] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 dark:[&::-webkit-calendar-picker-indicator]:invert"
                />
              </Field>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-[var(--text)]">
                  Con cuánta antelación
                </span>
                <SegmentedControl
                  value={String(diasAnticipacion)}
                  options={OPCIONES_ANTICIPACION}
                  ariaLabel="Antelación del aviso de riego"
                  onChange={(valor) => void guardarRecordatorios({ diasAnticipacion: Number(valor) })}
                />
              </div>
            </div>

            {/* Programación: cuántos avisos hay ahora mismo armados. */}
            {activos && puedeAvisar ? (
              <p className="text-sm text-[var(--text-muted)]" role="status">
                {programados === null
                  ? 'Contando los avisos…'
                  : programados === 0
                    ? 'Ahora mismo no hay ningún aviso programado.'
                    : `${programados} ${programados === 1 ? 'planta tiene' : 'plantas tienen'} un aviso programado.`}
              </p>
            ) : activos ? (
              <p className="text-sm text-[var(--text-muted)]">
                Sin permiso no se programa nada: hay que activar las notificaciones primero.
              </p>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Con el interruptor apagado no hay ningún aviso programado.
              </p>
            )}

            <Button
              variant="secondary"
              fullWidth
              loading={probando}
              disabled={!puedeAvisar}
              onClick={() => void probar()}
            >
              Probar notificación
            </Button>

            {errorAvisos ? (
              <ErrorBanner
                title={errorAvisos.titulo}
                message={errorAvisos.mensaje}
                onDismiss={() => setErrorAvisos(null)}
              />
            ) : null}

            {/* Lo que esta app NO puede prometer. Se dice siempre, no se esconde. */}
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">{AVISO_LIMITACION}</p>
          </>
        )}
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