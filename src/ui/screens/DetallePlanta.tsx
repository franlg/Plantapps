/**
 * FICHA DE UNA PLANTA
 * ===================
 * Foto grande, cómo está el riego, los datos, el análisis con IA y todo el
 * historial agrupado por mes.
 *
 * El análisis se hace aquí mismo, sin cambiar de pantalla: en el móvil es más
 * rápido que abrir otra ruta y volver, sobre todo si la foto ya está hecha.
 */

import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAnalyses, useDb, usePhotoUrl, usePlant, useSettings, useTimeline } from '@/db/context'
import { aiService } from '@/services/ai'
import { guardarFoto, pickPhoto } from '@/services/photos'
import { formatDateEs, nowIso, relativeEs } from '@/lib/dates'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  EstadoRiegoChip,
  Spinner,
  VeredictoChip,
} from '@/ui/components'
import {
  BotonEnlace,
  Cabecera,
  FilaDato,
  Pantalla,
  TituloSeccion,
} from '@/ui/screens/Comunes'
import {
  agruparPorMes,
  avisoError,
  colorSalud,
  contextoParaIa,
  fechaLegible,
  tonoSalud,
  useEstadosRiego,
  useVistaFoto,
} from '@/ui/screens/datos'
import type { AvisoError } from '@/ui/screens/datos'
import { EVENTO_EMOJI, EVENTO_LABELS, GRAVEDAD_LABELS, LUZ_LABELS } from '@/types'
import type { AiAnalysis, CareEvent } from '@/types'

/**
 * Aviso de error de la pantalla. El reintento viaja dentro del mismo objeto y
 * no en un estado aparte: un `useState` con la función suelta la confundiría
 * con una función de actualización y entraría en bucle.
 */
interface ErrorPantalla extends AvisoError {
  reintentar?: () => void
}

/** Barra de salud 0-100, que se lee de un vistazo. */
function BarraSalud({ salud }: { salud: number }) {
  const acotado = Math.max(0, Math.min(100, Math.round(salud)))

  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={`Salud de la planta: ${acotado} de 100`}
        aria-valuenow={acotado}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--border-soft)]"
      >
        <div
          className={`h-full rounded-full ${colorSalud(acotado)}`}
          style={{ width: `${Math.max(2, acotado)}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-[var(--text)] tabular-nums">{acotado}/100</span>
    </div>
  )
}

/** Lista corta de frases de la IA (síntomas o recomendaciones). */
function ListaTexto({ titulo, puntos }: { titulo: string; puntos: string[] }) {
  if (puntos.length === 0) return null

  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-[var(--text)]">{titulo}</p>
      <ul className="flex flex-col gap-1">
        {puntos.map((punto) => (
          <li key={punto} className="flex items-start gap-2 text-base text-[var(--text)]">
            <span aria-hidden="true" className="text-[var(--text-muted)]">
              ·
            </span>
            <span className="min-w-0 flex-1">{punto}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** El resultado del análisis de la IA, con sus dos acciones siguientes. */
function TarjetaAnalisis({
  analisis,
  registering,
  onRegistrarRiego,
  onGuardarComentario,
}: {
  analisis: AiAnalysis
  registering: boolean
  onRegistrarRiego: () => void
  onGuardarComentario: () => void
}) {
  return (
    <Card className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <VeredictoChip veredicto={analisis.veredicto} />
        {analisis.problema && analisis.gravedad && analisis.gravedad !== 'ninguna' ? (
          <Badge tone={analisis.gravedad === 'grave' ? 'peligro' : 'alerta'}>
            Gravedad: {GRAVEDAD_LABELS[analisis.gravedad]}
          </Badge>
        ) : null}
      </div>

      <p className="mt-3 text-lg font-bold text-[var(--text)]">{analisis.accionPrincipal}</p>
      <p className="mt-1 text-base leading-relaxed text-[var(--text)]">{analisis.resumen}</p>

      <div className="mt-3">
        <BarraSalud salud={analisis.salud} />
      </div>

      <dl className="mt-2 divide-y divide-[var(--border-soft)]">
        <FilaDato etiqueta="Riego">
          {analisis.regar
            ? analisis.frecuenciaRiegoDias
              ? `Sí, cada ${analisis.frecuenciaRiegoDias} días`
              : 'Sí'
            : 'No hace falta ahora'}
        </FilaDato>
        <FilaDato etiqueta="Confianza">{analisis.confianza}</FilaDato>
      </dl>

      {analisis.confianza === 'baja' ? (
        <p className="mt-2 rounded-xl bg-alerta-100 p-3 text-sm text-alerta-900 dark:bg-alerta-900 dark:text-alerta-100">
          <span aria-hidden="true">⚠️</span> Fídate poco: la foto puede no estar clara. Si el consejo te
          parece raro, hazle otra foto de cerca.
        </p>
      ) : null}

      {analisis.problema ? (
        <div className="mt-3">
          <p className="mb-1 text-sm font-semibold text-[var(--text)]">Problema</p>
          <p className="text-base text-[var(--text)]">{analisis.problema}</p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-3">
        <ListaTexto titulo="Lo que se ve" puntos={analisis.sintomas} />
        <ListaTexto titulo="Qué hacer" puntos={analisis.recomendaciones} />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button size="lg" fullWidth onClick={onRegistrarRiego} loading={registering}>
          Registrar riego
        </Button>
        <Button variant="secondary" fullWidth onClick={onGuardarComentario}>
          Guardar como comentario
        </Button>
      </div>
    </Card>
  )
}

/** La versión corta que aparece dentro del historial. */
function ResumenAnalisis({ analisis }: { analisis: AiAnalysis }) {
  return (
    <div className="superficie mt-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <VeredictoChip veredicto={analisis.veredicto} />
        <Badge tone={tonoSalud(analisis.salud)}>Salud {analisis.salud}/100</Badge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text)]">{analisis.resumen}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{analisis.accionPrincipal}</p>
    </div>
  )
}

export function DetallePlanta() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const db = useDb()
  const { settings } = useSettings()

  const planta = usePlant(id)
  const [resuelto, setResuelto] = useState(false)
  useEffect(() => {
    let vivo = true
    if (!id) {
      setResuelto(true)
      return
    }
    void db.plants.get(id).then(
      () => vivo && setResuelto(true),
      () => vivo && setResuelto(true),
    )
    return () => {
      vivo = false
    }
  }, [db, id])

  const plantaId = planta?.id
  const eventos = useTimeline(plantaId)
  const analisisGuardados = useAnalyses(plantaId)
  const analisisPorId = useMemo(
    () => new Map(analisisGuardados.map((analisis) => [analisis.id, analisis])),
    [analisisGuardados],
  )
  const estados = useEstadosRiego(plantaId ? [plantaId] : [])
  const estado = plantaId ? estados[plantaId] : undefined

  const urlPortada = usePhotoUrl(planta?.fotoPortadaId)

  // Estado del panel de IA.
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [foto, setFoto] = useState<File | null>(null)
  const [analizando, setAnalizando] = useState(false)
  const [resultado, setResultado] = useState<AiAnalysis | null>(null)
  const [error, setError] = useState<ErrorPantalla | null>(null)
  const [registrando, setRegistrando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)

  // Estado de las acciones sobre la planta.
  const [eventoABorrar, setEventoABorrar] = useState<CareEvent | null>(null)
  const [archivarAbierto, setArchivarAbierto] = useState(false)
  const [archivando, setArchivando] = useState(false)
  const [cambiandoFoto, setCambiandoFoto] = useState(false)

  const vistaFoto = useVistaFoto(foto)
  const hayClave = (settings.apiKey ?? '').trim() !== ''
  const grupos = useMemo(() => agruparPorMes(eventos), [eventos])

  /** Avisa de un fallo y deja apuntado cómo volver a intentarlo. */
  const mostrarError = (problema: unknown, porDefecto: string, reintentar?: () => void) => {
    setError({ ...avisoError(problema, porDefecto), reintentar })
  }

  const cerrarError = () => {
    setError(null)
  }

  const registrarRiego = async (nota?: string) => {
    if (!plantaId) return
    setRegistrando(true)
    try {
      await db.events.create({ plantId: plantaId, tipo: 'riego', fecha: nowIso(), nota })
      setConfirmado(true)
    } catch (problema) {
      mostrarError(problema, 'No se ha podido registrar el riego', () => void registrarRiego(nota))
    } finally {
      setRegistrando(false)
    }
  }

  const guardarComentario = async () => {
    if (!plantaId || !resultado) return
    setRegistrando(true)
    try {
      await db.events.create({
        plantId: plantaId,
        tipo: 'comentario',
        fecha: nowIso(),
        nota: `${resultado.accionPrincipal}. ${resultado.resumen}`,
      })
      setConfirmado(true)
    } catch (problema) {
      mostrarError(problema, 'No se ha podido guardar el comentario', () => void guardarComentario())
    } finally {
      setRegistrando(false)
    }
  }

  const elegirFoto = async (fuente: 'camara' | 'galeria') => {
    if (!plantaId) return
    cerrarError()
    try {
      const archivo = await pickPhoto(fuente)
      if (!archivo) return
      setFoto(archivo)
      setResultado(null)
    } catch (problema) {
      mostrarError(problema, 'No se ha podido elegir la foto', () => void elegirFoto(fuente))
    }
  }

  const cambiarPortada = async () => {
    if (!plantaId) return
    setCambiandoFoto(true)
    cerrarError()
    try {
      const archivo = await pickPhoto('galeria')
      if (!archivo) return
      const guardada = await guardarFoto(db, archivo)
      await db.plants.setFotoPortada(plantaId, guardada.id)
    } catch (problema) {
      mostrarError(problema, 'No se ha podido cambiar la foto', () => void cambiarPortada())
    } finally {
      setCambiandoFoto(false)
    }
  }

  const analizar = async () => {
    if (!planta || !foto) return
    setAnalizando(true)
    cerrarError()
    setConfirmado(false)

    try {
      const contexto = contextoParaIa(planta, eventos, estado)
      const borrador = await aiService.analyze({ plantId: planta.id, foto, contexto })

      // La foto se guarda siempre: es la prueba de lo que dijo la IA y
      // sirve de portada si la planta todavía no tenía ninguna.
      const guardada = await guardarFoto(db, foto)
      const analisis = await db.analyses.create({
        ...borrador,
        plantId: planta.id,
        photoId: guardada.id,
        modelo: settings.modelo,
      })

      if (!planta.fotoPortadaId) {
        await db.plants.setFotoPortada(planta.id, guardada.id)
      }

      await db.events.create({
        plantId: planta.id,
        tipo: 'analisis',
        fecha: nowIso(),
        analysisId: analisis.id,
        nota: borrador.resumen,
      })

      setResultado(analisis)
    } catch (problema) {
      mostrarError(problema, 'No se ha podido analizar la planta', () => void analizar())
    } finally {
      setAnalizando(false)
    }
  }

  const borrarEvento = async () => {
    if (!eventoABorrar) return
    const evento = eventoABorrar
    setEventoABorrar(null)
    try {
      // Si era un análisis, también se borra: si no, seguiría avisando de un
      // análisis que el usuario ya no ve en ninguna parte.
      if (evento.tipo === 'analisis' && evento.analysisId) {
        await db.analyses.remove(evento.analysisId)
      }
      await db.events.remove(evento.id)
    } catch {
      // Si no se borra, el historial sigue igual: no merecía un aviso en pantalla.
    }
  }

  const archivar = async () => {
    if (!plantaId) return
    setArchivando(true)
    try {
      await db.plants.setArchivada(plantaId, true)
      setArchivarAbierto(false)
      navegar('/', { replace: true })
    } catch {
      // El botón se queda pulsable: se reintenta con otro toque.
    } finally {
      setArchivando(false)
    }
  }

  if (!id) return <Navigate to="/" replace />

  if (!resuelto) {
    return (
      <Pantalla>
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Cargando la planta" />
        </div>
      </Pantalla>
    )
  }

  if (!planta) {
    return (
      <Pantalla>
        <Cabecera titulo="No encontramos esa planta" />
        <EmptyState
          icono="🪴"
          title="Esta planta ya no está"
          description="Puede que la hayas borrado desde otro sitio."
          action={<Button onClick={() => navegar('/', { replace: true })}>Ir al inicio</Button>}
        />
      </Pantalla>
    )
  }

  return (
    <Pantalla>
      {/* ------------------------------------------------------------ */}
      {/* Foto grande                                                    */}
      {/* ------------------------------------------------------------ */}
      <div className="mb-4">
        {urlPortada ? (
          <img
            src={urlPortada}
            alt={`Foto de ${planta.nombre}`}
            className="aspect-4/3 w-full rounded-2xl object-cover shadow-sm"
          />
        ) : (
          // Sin altura fija: el propio `EmptyState` da el alto y así nunca
          // se corta el texto en pantallas pequeñas.
          <div className="w-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-100 to-brand-300 dark:from-brand-900 dark:to-brand-700">
            <EmptyState
              icono="📷"
              title="Esta planta todavía no tiene foto"
              description="Una foto suya sirve para que la IA mire cómo está."
              action={<Button onClick={() => void cambiarPortada()}>Cambiar la foto</Button>}
            />
          </div>
        )}

        {urlPortada ? (
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            className="mt-2"
            loading={cambiandoFoto}
            onClick={() => void cambiarPortada()}
          >
            Cambiar la foto
          </Button>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Nombre y datos                                                */}
      {/* ------------------------------------------------------------ */}
      <Cabecera titulo={planta.nombre} detalle={planta.especie ?? undefined} />

      <div className="flex flex-wrap items-center gap-2">
        {estado ? (
          <EstadoRiegoChip estado={estado.estado} diasParaRiego={estado.diasParaRiego} />
        ) : null}
        {planta.luz ? <Badge tone="neutro">{LUZ_LABELS[planta.luz]}</Badge> : null}
      </div>

      <dl className="mt-3 divide-y divide-[var(--border-soft)]">
        {planta.fechaPlantado ? (
          <FilaDato etiqueta="Plantada">
            {`${formatDateEs(planta.fechaPlantado)} · ${relativeEs(planta.fechaPlantado)}`}
          </FilaDato>
        ) : null}
        {estado?.frecuenciaDias ? (
          <FilaDato etiqueta="Cada">{`${estado.frecuenciaDias} días`}</FilaDato>
        ) : null}
        {planta.maceta ? <FilaDato etiqueta="Maceta">{planta.maceta}</FilaDato> : null}
        {planta.ubicacion ? <FilaDato etiqueta="Ubicación">{planta.ubicacion}</FilaDato> : null}
        {planta.luz ? <FilaDato etiqueta="Luz">{LUZ_LABELS[planta.luz]}</FilaDato> : null}
      </dl>

      {planta.notas ? (
        <Card className="mt-3">
          <p className="mb-1 text-sm font-semibold text-[var(--text)]">Notas</p>
          <p className="text-base leading-relaxed whitespace-pre-line text-[var(--text)]">
            {planta.notas}
          </p>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------ */}
      {/* Acciones principales                                          */}
      {/* ------------------------------------------------------------ */}
      <div className="mt-4 flex flex-col gap-2">
        <Button size="lg" fullWidth onClick={() => setPanelAbierto((abierto) => !abierto)}>
          {panelAbierto ? 'Cerrar el análisis' : 'Analizar con IA'}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            loading={registrando}
            onClick={() => void registrarRiego()}
          >
            Registrar riego
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => void navegar(`/planta/${planta.id}/editar`)}
          >
            Editar
          </Button>
        </div>
      </div>

      {confirmado && !error ? (
        <p className="mt-2 rounded-xl bg-ok-100 p-3 text-sm text-ok-800 dark:bg-ok-900 dark:text-ok-100">
          <span aria-hidden="true">✅</span> Guardado en el historial.
        </p>
      ) : null}

      {/*
        El aviso va fuera del panel de la IA a propósito: así también se ve
        cuando lo que ha fallado es cambiar la foto de portada.
      */}
      {error ? (
        <div className="mt-3">
          <ErrorBanner
            title={error.titulo}
            message={error.mensaje}
            onRetry={error.reintentar}
            onDismiss={cerrarError}
          />
          {error.irA ? (
            <BotonEnlace to={error.irA} className="mt-2 w-full">
              Ir a Ajustes
            </BotonEnlace>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------------------ */}
      {/* Panel de análisis con IA                                      */}
      {/* ------------------------------------------------------------ */}
      {panelAbierto ? (
        <section aria-labelledby="titulo-ia" className="mt-4">
          <Card>
            <h2 id="titulo-ia" className="text-base font-semibold text-[var(--text)]">
              Analizar con IA
            </h2>

            {!hayClave ? (
              <div className="mt-3">
                <p className="text-base text-[var(--text)]">
                  Añade tu clave gratuita en Ajustes para usar la IA.
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Se consigue en un minuto y se guarda solo en este dispositivo.
                </p>
                <BotonEnlace to="/ajustes" className="mt-3 w-full">
                  Ir a Ajustes
                </BotonEnlace>
              </div>
            ) : (
              <>
                {vistaFoto ? (
                  <img
                    src={vistaFoto}
                    alt="Foto elegida para analizar"
                    className="mt-3 aspect-4/3 w-full rounded-2xl object-cover"
                  />
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-base text-[var(--text)]">
                      Hazle una foto a la planta y te digo si toca regar, trasplantar o si tiene algo.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button className="flex-1" onClick={() => void elegirFoto('camara')}>
                        Hacer foto
                      </Button>
                      <Button variant="secondary" className="flex-1" onClick={() => void elegirFoto('galeria')}>
                        Elegir de la galería
                      </Button>
                    </div>
                  </div>
                )}

                {vistaFoto ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      className="flex-1"
                      size="lg"
                      loading={analizando}
                      onClick={() => void analizar()}
                    >
                      Analizar
                    </Button>
                    <Button variant="secondary" onClick={() => void elegirFoto('camara')}>
                      Otra foto
                    </Button>
                  </div>
                ) : null}

                {analizando ? (
                  <div className="mt-3 flex items-center gap-2 text-[var(--text-muted)]">
                    <Spinner label="Analizando la foto" />
                    <span className="text-sm">La IA está mirando la planta. Tarda unos segundos.</span>
                  </div>
                ) : null}

                {resultado ? (
                  <TarjetaAnalisis
                    analisis={resultado}
                    registering={registrando}
                    onRegistrarRiego={() => void registrarRiego('Riego tras el análisis de la IA')}
                    onGuardarComentario={() => void guardarComentario()}
                  />
                ) : null}
              </>
            )}
          </Card>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ */}
      {/* Historial                                                     */}
      {/* ------------------------------------------------------------ */}
      <TituloSeccion>Historial</TituloSeccion>

      {grupos.length === 0 ? (
        <EmptyState
          icono="📝"
          title="Todavía no hay nada anotado"
          description="Registra riegos y comentarios: la app te avisará cuando toque regar."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map((grupo) => (
            <section key={grupo.clave} aria-label={`Historial de ${grupo.titulo}`}>
              <h3 className="mb-1 text-sm font-semibold text-[var(--text-muted)]">{grupo.titulo}</h3>
              <ul className="flex flex-col">
                {grupo.eventos.map((evento) => {
                  const analisis = evento.analysisId ? analisisPorId.get(evento.analysisId) : undefined

                  return (
                    <li key={evento.id} className="superficie-faja flex gap-3 border-b border-[var(--border-soft)] py-3">
                      <span aria-hidden="true" className="text-xl leading-6">
                        {EVENTO_EMOJI[evento.tipo]}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-base font-semibold text-[var(--text)]">
                            {EVENTO_LABELS[evento.tipo]}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEventoABorrar(evento)}
                          >
                            {/* El espacio va fuera: si no, el nombre accesible queda "Borrar…". */}
                            Borrar{' '}
                            <span className="sr-only">
                              el evento {EVENTO_LABELS[evento.tipo]} del {fechaLegible(evento.fecha)}
                            </span>
                          </Button>
                        </div>

                        <p className="text-sm text-[var(--text-muted)]">{fechaLegible(evento.fecha)}</p>

                        {evento.nota ? (
                          <p className="mt-1 text-base whitespace-pre-line text-[var(--text)]">
                            {evento.nota}
                          </p>
                        ) : null}

                        {evento.cantidad ? (
                          <p className="mt-1 text-sm text-[var(--text-muted)]">{evento.cantidad}</p>
                        ) : null}

                        {analisis ? <ResumenAnalisis analisis={analisis} /> : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Archivar                                                      */}
      {/* ------------------------------------------------------------ */}
      <TituloSeccion>Zona tranquila</TituloSeccion>
      <p className="mb-2 text-sm text-[var(--text-muted)]">
        Archivar la planta la quita de la lista de inicio pero deja todos sus riegos y análisis. Puedes
        recuperarla desde Ajustes.
      </p>
      <Button variant="secondary" fullWidth onClick={() => setArchivarAbierto(true)}>
        Archivar planta
      </Button>

      <ConfirmDialog
        open={eventoABorrar !== null}
        title={`¿Borrar el evento?`}
        message={`Se borra «${eventoABorrar ? EVENTO_LABELS[eventoABorrar.tipo] : ''}» del ${eventoABorrar ? fechaLegible(eventoABorrar.fecha) : ''}. Si era un análisis, se borra también su resultado. No se puede deshacer.`}
        confirmLabel="Sí, borrar"
        cancelLabel="Cancelar"
        onConfirm={() => void borrarEvento()}
        onCancel={() => setEventoABorrar(null)}
        destructive
      />

      <ConfirmDialog
        open={archivarAbierto}
        title="¿Archivar la planta?"
        message={`${planta.nombre} desaparece de Inicio, pero su historial y sus análisis se conservan. Puedes recuperarla desde Ajustes › Plantas archivadas.`}
        confirmLabel="Sí, archivar"
        cancelLabel="Cancelar"
        onConfirm={() => void archivar()}
        onCancel={() => setArchivarAbierto(false)}
      />

      {archivando ? (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center">
          <Spinner label="Archivando" />
        </div>
      ) : null}
    </Pantalla>
  )
}