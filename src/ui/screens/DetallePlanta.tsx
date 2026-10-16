/**
 * FICHA DE UNA PLANTA
 * ===================
 * Foto grande, cómo está el riego, los datos, el análisis con IA y todo el
 * historial agrupado por mes.
 *
 * El análisis se hace aquí mismo, sin cambiar de pantalla: en el móvil es más
 * rápido que abrir otra ruta y volver, sobre todo si la foto ya está hecha.
 *
 * Además de mirar la planta, la ficha la explica: una guía de cuidados que se
 * pide una vez y se consulta, y "¿qué planta es?", para cuando el usuario no
 * sabe qué ha comprado.
 *
 * Y de dos fotos nuevas: la tira de "Progreso", que enseña cómo ha cambiado la
 * planta con los meses, y el interruptor de "comparar con la foto anterior",
 * que le da a la IA las dos fotos para que diga si ha mejorado.
 */

import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  useAnalyses,
  useDb,
  useFotosProgreso,
  useGuia,
  usePhotoUrl,
  usePlant,
  useSettings,
  useTimeline,
} from '@/db/context'
import { aiService } from '@/services/ai'
import { guardarFoto, pickPhoto } from '@/services/photos'
import { frecuenciaSugerida } from '@/services/reminders'
import { formatDateEs, nowIso, relativeEs } from '@/lib/dates'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  EstadoRiegoChip,
  GaleriaProgreso,
  Interruptor,
  SegmentedControl,
  Sheet,
  Spinner,
  TarjetaComparacion,
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
  contextoParaGuia,
  contextoParaIa,
  fechaLegible,
  guiaDesactualizada,
  lineaComparacion,
  pistasParaIdentificar,
  resumenCambios,
  tonoConfianza,
  tonoDificultad,
  tonoSalud,
  useEstadosRiego,
  useVistaFoto,
} from '@/ui/screens/datos'
import { cn } from '@/lib/cn'
import type { AvisoError } from '@/ui/screens/datos'
import { AiError, DIFICULTAD_LABELS, EVENTO_EMOJI, EVENTO_LABELS, GRAVEDAD_LABELS, LUZ_LABELS } from '@/types'
import type { AiAnalysis, CareEvent, GuiaCuidados, IdentificacionDraft } from '@/types'

/**
 * De dónde sale la foto que se manda a la IA.
 *
 * `portada` reutiliza la foto que ya está subida en la ficha, que es lo que
 * quiere la mayoría de las veces: no hace falta volver a hacer la foto cada vez.
 */
type FuenteFoto = 'camara' | 'galeria' | 'portada'

const ETIQUETAS_FUENTE: Record<FuenteFoto, string> = {
  camara: 'Cámara',
  galeria: 'Galería',
  portada: 'La de la ficha',
}

/**
 * Aviso de error de la pantalla. El reintento viaja dentro del mismo objeto y
 * no en un estado aparte: un `useState` con la función suelta la confundiría
 * con una función de actualización y entraría en bucle.
 */
interface ErrorPantalla extends AvisoError {
  reintentar?: () => void
}

/**
 * Selector de foto, igual en los tres sitios donde hace falta.
 *
 * Muestra "La de la ficha" solo si la planta tiene portada, y cuando ya hay una
 * foto elegida deja **retirarla** para poder empezar de cero o elegir otra, en
 * lugar de tener que adivinar cómo se cambia.
 */
function SelectorFoto({
  valor,
  onElegir,
  onRetirar,
  hayPortada,
  cargando = false,
  className,
}: {
  valor: FuenteFoto
  onElegir: (fuente: FuenteFoto) => void
  /** Quita la foto elegida y vuelve a mostrar el selector. */
  onRetirar: () => void
  hayPortada: boolean
  cargando?: boolean
  className?: string
}) {
  const opciones: Array<{ value: FuenteFoto; label: string }> = hayPortada
    ? [
        { value: 'camara', label: ETIQUETAS_FUENTE.camara },
        { value: 'galeria', label: ETIQUETAS_FUENTE.galeria },
        { value: 'portada', label: ETIQUETAS_FUENTE.portada },
      ]
    : [
        { value: 'camara', label: ETIQUETAS_FUENTE.camara },
        { value: 'galeria', label: ETIQUETAS_FUENTE.galeria },
      ]

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <SegmentedControl
        value={valor}
        options={opciones}
        onChange={(fuente) => onElegir(fuente)}
        ariaLabel="De dónde sacar la foto"
      />
      {cargando ? null : (
        <Button variant="ghost" size="sm" onClick={onRetirar}>
          Usar otra foto
        </Button>
      )}
    </div>
  )
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

/** Lista corta de frases sueltas (síntomas, recomendaciones, consejos). */
function ListaViñetas({ puntos }: { puntos: string[] }) {
  if (puntos.length === 0) return null

  return (
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
  )
}

/** Lista corta de frases de la IA (síntomas o recomendaciones). */
function ListaTexto({ titulo, puntos }: { titulo: string; puntos: string[] }) {
  if (puntos.length === 0) return null

  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-[var(--text)]">{titulo}</p>
      <ListaViñetas puntos={puntos} />
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

      {/*
        La comparación va justo aquí: es lo primero que se quiere saber ("¿ha
        mejorado?") y antes de que empiecen las recomendaciones. Si el modelo no
        pudo comparar, la tarjeta lo dice en neutro y no se adorna.
      */}
      {analisis.comparacion ? (
        <TarjetaComparacion
          tendencia={analisis.comparacion.tendencia}
          detalle={analisis.comparacion.detalle}
          comparable={analisis.comparacion.habiaAnterior}
          className="mt-3"
        />
      ) : null}

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
  // Una línea y ninguna más: el historial es largo y aquí no se reitera el
  // análisis entero, solo el cambio respecto a la foto anterior.
  const comparacion = lineaComparacion(analisis)

  return (
    <div className="superficie mt-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <VeredictoChip veredicto={analisis.veredicto} />
        <Badge tone={tonoSalud(analisis.salud)}>Salud {analisis.salud}/100</Badge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text)]">{analisis.resumen}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{analisis.accionPrincipal}</p>
      {comparacion ? (
        <p className="mt-1 text-xs font-semibold text-[var(--text)]">{comparacion}</p>
      ) : null}
    </div>
  )
}

/**
 * GUÍA DE CUIDADOS
 * ================
 * Un texto de consulta, no un aviso: se escribe una vez y se relee cuando
 * hacen falta datos. Por eso no ensucia el historial con eventos.
 */
function TarjetaGuia({
  guia,
  generando,
  onRegenerar,
  onBorrar,
}: {
  guia: GuiaCuidados
  generando: boolean
  onRegenerar: () => void
  onBorrar: () => void
}) {
  const desactualizada = guiaDesactualizada(guia.generadoEn)

  return (
    <Card>
      <p className="text-lg font-bold text-[var(--text)]">{guia.nombreComun}</p>
      <p className="text-base text-[var(--text-muted)]">
        {guia.familia ? `${guia.nombreCientifico} · ${guia.familia}` : guia.nombreCientifico}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone={tonoDificultad(guia.dificultad)}>
          {`Dificultad: ${DIFICULTAD_LABELS[guia.dificultad]}`}
        </Badge>
        <span className="text-xs text-[var(--text-muted)]">{`Generada el ${formatDateEs(guia.generadoEn)}`}</span>
      </div>

      {desactualizada ? (
        <p className="mt-3 rounded-xl bg-alerta-100 p-3 text-sm text-alerta-900 dark:bg-alerta-900 dark:text-alerta-100">
          <span aria-hidden="true">🕰️</span> Es de hace más de medio año y puede estar desactualizada. Si la
          planta ha cambiado mucho, regenérala.
        </p>
      ) : null}

      <p className="mt-3 text-base leading-relaxed text-[var(--text)]">{guia.resumen}</p>

      {guia.frecuenciaRiegoDias ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {`Riego: cada ${guia.frecuenciaRiegoDias} días.`}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-4">
        {guia.secciones.map((seccion) => (
          <section key={seccion.titulo}>
            <h3 className="mb-1 text-sm font-semibold tracking-wide text-[var(--text-muted)] uppercase">
              {seccion.titulo}
            </h3>
            <p className="text-base leading-relaxed text-[var(--text)]">{seccion.contenido}</p>
            {seccion.puntos ? (
              <div className="mt-1">
                <ListaViñetas puntos={seccion.puntos} />
              </div>
            ) : null}
          </section>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button variant="secondary" fullWidth loading={generando} onClick={onRegenerar}>
          Regenerar
        </Button>
        <Button variant="ghost" size="sm" onClick={onBorrar}>
          Borrar la guía
        </Button>
      </div>
    </Card>
  )
}

/**
 * LO QUE LA IA HA RECONOCIDO
 * ==========================
 * `especie: null` es una respuesta buena, no un fallo: se dice con claridad y se
 * ofrece otra foto. Nunca se rellena medio dato a medias.
 */
function PanelIdentificacion({
  identificacion,
  tablaDias,
  onRepetir,
  onPedirTabla,
}: {
  identificacion: IdentificacionDraft
  tablaDias: number | null
  onRepetir: () => void
  onPedirTabla: () => void
}) {
  const desconocida = identificacion.especie === null
  // La tabla y el modelo pueden no cuadrar. Se avisa y se deja elegir.
  const discrepancia =
    !desconocida && tablaDias != null && identificacion.frecuenciaRiegoDias != null &&
    tablaDias !== identificacion.frecuenciaRiegoDias

  return (
    <div className="mt-4">
      {desconocida ? (
        <p className="text-lg font-semibold text-[var(--text)]">No he podido reconocerla</p>
      ) : (
        <>
          <p className="text-xl font-bold text-[var(--text)]">{identificacion.especie}</p>
          {identificacion.nombreComun ? (
            <p className="text-base text-[var(--text)]">{identificacion.nombreComun}</p>
          ) : null}
        </>
      )}

      {identificacion.familia ? (
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">{`Familia: ${identificacion.familia}`}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone={tonoConfianza(identificacion.confianza)}>
          {`Confianza: ${identificacion.confianza}`}
        </Badge>
      </div>

      <p className="mt-2 text-base leading-relaxed text-[var(--text)]">{identificacion.razon}</p>

      {identificacion.confianza === 'baja' ? (
        <p className="mt-3 rounded-xl bg-alerta-100 p-3 text-sm text-alerta-900 dark:bg-alerta-900 dark:text-alerta-100">
          <span aria-hidden="true">⚠️</span> Fídate poco: la foto puede no estar clara o ser parcial.
          Hazle otra foto de cerca y con buena luz.
        </p>
      ) : null}

      {identificacion.alternativas.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-sm font-semibold text-[var(--text)]">También podría ser</p>
          <ListaViñetas puntos={identificacion.alternativas} />
        </div>
      ) : null}

      {discrepancia ? (
        <div className="mt-3 rounded-xl bg-[var(--border-soft)] p-3">
          <p className="text-sm text-[var(--text)]">
            {`La tabla de la app sugiere regarla cada ${tablaDias} días.`}
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={onPedirTabla}>
            {`Usar los ${tablaDias} días de la tabla`}
          </Button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        <Button variant="secondary" fullWidth onClick={onRepetir}>
          Repetir con otra foto
        </Button>
      </div>
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
  const guia = useGuia(plantaId)
  const fotosProgreso = useFotosProgreso(plantaId)
  const analisisPorId = useMemo(
    () => new Map(analisisGuardados.map((analisis) => [analisis.id, analisis])),
    [analisisGuardados],
  )
  /**
   * El análisis más reciente con foto: es contra el que se compara. Sin él no
   * hay con qué comparar y ni se ofrece el interruptor.
   */
  const analisisPrevio = useMemo(
    () => analisisGuardados.find((analisis) => Boolean(analisis.photoId)) ?? null,
    [analisisGuardados],
  )
  const estados = useEstadosRiego(plantaId ? [plantaId] : [])
  const estado = plantaId ? estados[plantaId] : undefined

  const urlPortada = usePhotoUrl(planta?.fotoPortadaId)

  // Estado del panel de IA.
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [foto, setFoto] = useState<File | null>(null)
  const [fuenteAnalisis, setFuenteAnalisis] = useState<FuenteFoto>('camara')
  const [analizando, setAnalizando] = useState(false)
  const [resultado, setResultado] = useState<AiAnalysis | null>(null)
  const [error, setError] = useState<ErrorPantalla | null>(null)
  const [registrando, setRegistrando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  /**
   * Comparar con la foto anterior. Apagado por defecto: son dos imágenes en
   * cada consulta y no se manda ni una más de las que el usuario pide.
   */
  const [comparar, setComparar] = useState(false)

  // Estado de la guía de cuidados.
  const [pidiendoGuia, setPidiendoGuia] = useState(false)
  const [regenerarAbierto, setRegenerarAbierto] = useState(false)
  const [borrarGuiaAbierto, setBorrarGuiaAbierto] = useState(false)

  // Estado de "¿qué planta es?".
  const [identificarAbierto, setIdentificarAbierto] = useState(false)
  const [fuenteFoto, setFuenteFoto] = useState<FuenteFoto>('camara')
  const [fotoIdentificar, setFotoIdentificar] = useState<File | null>(null)
  const [identificando, setIdentificando] = useState(false)
  const [identificacion, setIdentificacion] = useState<IdentificacionDraft | null>(null)
  const [errorIdentificar, setErrorIdentificar] = useState<AvisoError | null>(null)
  const [rellenoAbierto, setRellenoAbierto] = useState(false)
  const [rellenando, setRellenando] = useState(false)
  /** `null` = se queda con la cifra del modelo; con número = la de la tabla de la app. */
  const [riegoElegido, setRiegoElegido] = useState<number | null>(null)

  // Estado de las acciones sobre la planta.
  const [eventoABorrar, setEventoABorrar] = useState<CareEvent | null>(null)
  const [archivarAbierto, setArchivarAbierto] = useState(false)
  const [archivando, setArchivando] = useState(false)
  const [cambiandoFoto, setCambiandoFoto] = useState(false)

  const vistaFoto = useVistaFoto(foto)
  const vistaFotoIdentificar = useVistaFoto(fotoIdentificar)
  const hayClave = (settings.apiKey ?? '').trim() !== ''
  const grupos = useMemo(() => agruparPorMes(eventos), [eventos])

  /** La tabla de la app y lo que dice el modelo, para poder compararlos. */
  const tablaIdentificacion = useMemo(
    () => (identificacion?.especie ? frecuenciaSugerida(identificacion.especie) : null),
    [identificacion],
  )

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

  /**
   * La foto que ya está en la ficha de la planta, como si la hubiera elegido el
   * usuario a mano. Evita tener que volver a hacer la foto para cada análisis.
   */
  const fotoDePortada = async (): Promise<File | null> => {
    if (!planta?.fotoPortadaId) return null
    const guardada = await db.photos.get(planta.fotoPortadaId)
    if (!guardada) return null
    return new File([guardada.blob], 'foto-de-la-ficha.jpg', { type: guardada.blob.type })
  }

  /** Elige una foto desde la fuente indicada y la deja lista para analizar. */
  const tomarFoto = async (fuente: FuenteFoto): Promise<File | null> => {
    if (fuente === 'portada') return fotoDePortada()
    return pickPhoto(fuente)
  }

  const elegirFoto = async (fuente: FuenteFoto) => {
    if (!plantaId) return
    cerrarError()
    setFuenteAnalisis(fuente)
    try {
      const archivo = await tomarFoto(fuente)
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

  /**
   * La foto del análisis anterior y cuándo se hizo, para comparar.
   *
   * `null` si el interruptor está apagado, si la planta todavía no tiene
   * análisis previos o si esa foto ya no está guardada: en los tres casos se
   * analiza sin comparación, que es mejor que mandar una comparación a medias.
   */
  const fotoPrevia = async (): Promise<{ blob: Blob; fecha: string } | null> => {
    const previo = analisisPrevio
    if (!comparar || !previo) return null
    const guardada = await db.photos.get(previo.photoId)
    return guardada ? { blob: guardada.blob, fecha: previo.fecha } : null
  }

  const analizar = async () => {
    if (!planta || !foto) return
    setAnalizando(true)
    cerrarError()
    setConfirmado(false)

    try {
      const contexto = contextoParaIa(planta, eventos, estado)
      const previa = await fotoPrevia()
      const borrador = await aiService.analyze({
        plantId: planta.id,
        foto,
        contexto,
        // Sin foto anterior no se manda `comparar`: ni una imagen de más.
        ...(previa ? { comparar: true, fotoAnterior: previa.blob, fechaAnterior: previa.fecha } : {}),
      })

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

  /**
   * Pide la guía de cuidados. Con foto de portada el modelo la afina a esa
   * planta concreta; sin ella se la pide solo con los datos que ya tenemos.
   * No crea ningún evento: la guía es un texto de consulta, no un análisis.
   */
  const pedirGuia = async () => {
    if (!planta) return
    if (!hayClave) {
      mostrarError(new AiError('Falta la clave de la API', 'sin_clave'), 'Falta la clave de la IA')
      return
    }

    setPidiendoGuia(true)
    cerrarError()
    setRegenerarAbierto(false)

    try {
      const ultimoRiego = eventos.find((evento) => evento.tipo === 'riego')?.fecha ?? null
      const portada = planta.fotoPortadaId ? await db.photos.get(planta.fotoPortadaId) : undefined

      const borrador = await aiService.generarGuia({
        plantId: planta.id,
        ...(portada ? { foto: portada.blob } : {}),
        contexto: contextoParaGuia(planta, ultimoRiego),
        modelo: settings.modelo,
      })

      await db.guides.create({ ...borrador, plantId: planta.id, modelo: settings.modelo })
    } catch (problema) {
      mostrarError(
        problema,
        'No se ha podido escribir la guía de cuidados',
        () => void pedirGuia(),
      )
    } finally {
      setPidiendoGuia(false)
    }
  }

  const borrarGuia = async () => {
    if (!plantaId) return
    setBorrarGuiaAbierto(false)
    try {
      await db.guides.remove(plantaId)
    } catch {
      // Si no se borra, la guía sigue ahí: no merecía un aviso en pantalla.
    }
  }

  /** Abre "¿qué planta es?" de cero: sin foto y sin resultado anterior. */
  const abrirIdentificar = () => {
    setIdentificarAbierto(true)
    setFuenteFoto('camara')
    setFotoIdentificar(null)
    setIdentificacion(null)
    setErrorIdentificar(null)
    setRiegoElegido(null)
  }

  const cerrarIdentificar = () => {
    setIdentificarAbierto(false)
    setFotoIdentificar(null)
    setIdentificacion(null)
    setErrorIdentificar(null)
    setRiegoElegido(null)
  }

  const elegirFotoIdentificar = async (fuente: FuenteFoto) => {
    setFuenteFoto(fuente)
    setErrorIdentificar(null)
    try {
      const archivo = await tomarFoto(fuente)
      if (!archivo) return
      setFotoIdentificar(archivo)
      setIdentificacion(null)
      setRiegoElegido(null)
    } catch (problema) {
      setErrorIdentificar(avisoError(problema, 'No se ha podido elegir la foto'))
    }
  }

  const identificar = async () => {
    if (!planta || !fotoIdentificar) return

    setIdentificando(true)
    setErrorIdentificar(null)

    try {
      const borrador = await aiService.identificar({
        plantId: planta.id,
        foto: fotoIdentificar,
        pistas: pistasParaIdentificar(planta),
        modelo: settings.modelo,
      })
      setIdentificacion(borrador)
    } catch (problema) {
      setErrorIdentificar(avisoError(problema, 'No se ha podido identificar la planta'))
    } finally {
      setIdentificando(false)
    }
  }

  /**
   * Escribe en la ficha lo que ha dicho la IA, de golpe: especie, riego y luz.
   * Nunca un campo suelto, y nunca el historial.
   */
  const rellenarFicha = async () => {
    if (!planta || !plantaId || !identificacion?.especie) return

    const frecuencia = riegoElegido ?? identificacion.frecuenciaRiegoDias
    setRellenando(true)

    try {
      await db.plants.update(plantaId, {
        especie: identificacion.especie,
        frecuenciaRiegoDias: frecuencia ?? planta.frecuenciaRiegoDias,
        luz: identificacion.luz ?? planta.luz,
      })
      setRellenoAbierto(false)
      cerrarIdentificar()
    } catch (problema) {
      setRellenoAbierto(false)
      setErrorIdentificar(avisoError(problema, 'No se ha podido rellenar los datos de la planta'))
    } finally {
      setRellenando(false)
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

  // Lo que va a cambiar la ficha, en una frase por campo.
  const lineasRelleno = identificacion ? resumenCambios(identificacion, riegoElegido).join(' · ') : ''
  // Si el modelo y la tabla no cuadran, se avisa en una línea y se deja elegir.
  const notaTabla =
    tablaIdentificacion != null && identificacion?.frecuenciaRiegoDias != null &&
    tablaIdentificacion !== identificacion.frecuenciaRiegoDias && riegoElegido == null
      ? ` La tabla de la app sugiere regarla cada ${tablaIdentificacion} días.`
      : ''

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

      {/*
        La tira de progreso va pegada a la foto grande y al nombre, que es donde
        el usuario está mirando: "esta es ahora, estas son las anteriores". No
        se cuela entre la foto y el nombre para no esconder de qué planta es
        todo, y tampoco baja al historial, que ya es largo. Tocar una miniatura
        no hace nada: se ve lo que hay, sin diálogos por en medio.
      */}
      <GaleriaProgreso
        fotos={fotosProgreso}
        vacio="Cada análisis guarda una foto. Con el tiempo verás aquí cómo evoluciona la planta."
        className="mt-4"
      />

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
        <Button variant="secondary" fullWidth onClick={abrirIdentificar}>
          <span aria-hidden="true">🔍</span> ¿Qué planta es?
        </Button>
        {!planta.especie ? (
          <p className="text-sm text-[var(--text-muted)]">
            Si no sabes qué especie es, hazle una foto y te la digo.
          </p>
        ) : null}
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
      {/* Guía de cuidados                                             */}
      {/* ------------------------------------------------------------ */}
      <TituloSeccion>Guía de cuidados</TituloSeccion>

      {guia ? (
        <TarjetaGuia
          guia={guia}
          generando={pidiendoGuia}
          onRegenerar={() => setRegenerarAbierto(true)}
          onBorrar={() => setBorrarGuiaAbierto(true)}
        />
      ) : (
        <Card>
          <p className="text-base text-[var(--text)]">
            Una guía con cómo regarla, la luz que quiere y los problemas típicos. Se escribe una vez y se
            consulta cuando haga falta.
          </p>
          <Button size="lg" fullWidth className="mt-3" loading={pidiendoGuia} onClick={() => void pedirGuia()}>
            <span aria-hidden="true">📖</span> Pedir guía de cuidados
          </Button>
        </Card>
      )}

      {/* La guía tarda lo suyo: se dice, para que el botón no parezca colgado. */}
      {pidiendoGuia ? (
        <div className="mt-3 flex items-center gap-2 text-[var(--text-muted)]">
          <Spinner label="Escribiendo la guía de cuidados" />
          <span className="text-sm">La IA está escribiendo la guía. Tarda unos segundos.</span>
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
                  <p className="mt-3 text-base text-[var(--text)]">
                    Hazle una foto a la planta y te digo si toca regar, trasplantar o si tiene algo.
                  </p>
                )}

                <SelectorFoto
                  valor={fuenteAnalisis}
                  onElegir={(fuente) => void elegirFoto(fuente)}
                  onRetirar={() => {
                    setFoto(null)
                    setResultado(null)
                  }}
                  hayPortada={Boolean(planta?.fotoPortadaId)}
                  cargando={analizando}
                  className="mt-3"
                />

                {/*
                  Solo si hay un análisis previo: sin foto anterior no hay con
                  qué comparar, y ofrecerlo sería un botón que no puede hacer
                  nada. Va apagado porque comparar manda dos imágenes.
                */}
                {analisisPrevio ? (
                  <div className="mt-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-[var(--text)]">
                        Comparar con la foto anterior
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                        {`Las dos fotos, para que te diga si ha cambiado desde la del ${formatDateEs(analisisPrevio.fecha)}.`}
                      </p>
                    </div>
                    <Interruptor
                      activo={comparar}
                      etiqueta="Comparar con la foto anterior"
                      onChange={setComparar}
                    />
                  </div>
                ) : null}

                {vistaFoto ? (
                  <Button
                    className="mt-3"
                    size="lg"
                    fullWidth
                    loading={analizando}
                    onClick={() => void analizar()}
                  >
                    Analizar
                  </Button>
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

      <ConfirmDialog
        open={regenerarAbierto}
        title="¿Escribir la guía otra vez?"
        message={`Se pierde la guía del ${guia ? fechaLegible(guia.generadoEn) : 'otra vez'} y se escribe una nueva con los datos que tiene la planta ahora. No se toca el historial.`}
        confirmLabel="Sí, escribirla"
        cancelLabel="Cancelar"
        onConfirm={() => void pedirGuia()}
        onCancel={() => setRegenerarAbierto(false)}
      />

      <ConfirmDialog
        open={borrarGuiaAbierto}
        title="¿Borrar la guía?"
        message={`Se borra la guía de ${planta.nombre}. Los riegos y los análisis se quedan como están, y puedes volver a pedirla cuando quieras.`}
        confirmLabel="Sí, borrar"
        cancelLabel="Cancelar"
        onConfirm={() => void borrarGuia()}
        onCancel={() => setBorrarGuiaAbierto(false)}
        destructive
      />

      <ConfirmDialog
        open={rellenoAbierto}
        title="¿Rellenar los datos?"
        message={`En la ficha de «${planta.nombre}» se va a guardar: ${lineasRelleno}. El historial no cambia.${notaTabla}`}
        confirmLabel="Sí, rellenar"
        cancelLabel="Cancelar"
        onConfirm={() => void rellenarFicha()}
        onCancel={() => setRellenoAbierto(false)}
      />

      {/* ------------------------------------------------------------ */}
      {/* ¿Qué planta es?                                             */}
      {/* ------------------------------------------------------------ */}
      <Sheet
        open={identificarAbierto}
        onClose={cerrarIdentificar}
        title="¿Qué planta es?"
        footer={
          identificacion?.especie ? (
            <Button fullWidth size="lg" loading={rellenando} onClick={() => setRellenoAbierto(true)}>
              Rellenar los datos
            </Button>
          ) : undefined
        }
      >
        {!hayClave ? (
          <div>
            <p className="text-base text-[var(--text)]">
              Identificar plantas también usa la IA. Añade tu clave gratuita en Ajustes.
            </p>
            <BotonEnlace to="/ajustes" className="mt-3 w-full">
              Ir a Ajustes
            </BotonEnlace>
          </div>
        ) : (
          <>
            {errorIdentificar ? (
              <div className="mb-3">
                <ErrorBanner
                  title={errorIdentificar.titulo}
                  message={errorIdentificar.mensaje}
                  onRetry={fotoIdentificar ? () => void identificar() : undefined}
                  onDismiss={() => setErrorIdentificar(null)}
                />
                {errorIdentificar.irA ? (
                  <BotonEnlace to={errorIdentificar.irA} className="mt-2 w-full">
                    Ir a Ajustes
                  </BotonEnlace>
                ) : null}
              </div>
            ) : null}

            {vistaFotoIdentificar ? (
              <img
                src={vistaFotoIdentificar}
                alt="Foto para identificar la planta"
                className="aspect-4/3 w-full rounded-2xl object-cover"
              />
            ) : null}

            {!identificacion ? (
              <>
                {vistaFotoIdentificar ? null : (
                  <p className="text-base text-[var(--text)]">
                    Hazle una foto a la planta: mejor de cerca, con luz natural y sin sombras.
                  </p>
                )}

                <SegmentedControl
                  value={fuenteFoto}
                  options={[
                    { value: 'camara', label: 'Cámara' },
                    { value: 'galeria', label: 'Galería' },
                    ...(planta?.fotoPortadaId
                      ? [{ value: 'portada' as const, label: 'La de la ficha' }]
                      : []),
                  ]}
                  onChange={(fuente) => void elegirFotoIdentificar(fuente)}
                  ariaLabel="De dónde sacar la foto"
                  className="mt-3"
                />

                {vistaFotoIdentificar ? (
                  <Button
                    fullWidth
                    size="lg"
                    className="mt-3"
                    loading={identificando}
                    onClick={() => void identificar()}
                  >
                    Identificar
                  </Button>
                ) : null}
              </>
            ) : null}

            {identificando ? (
              <div className="mt-3 flex items-center gap-2 text-[var(--text-muted)]">
                <Spinner label="Identificando la planta" />
                <span className="text-sm">La IA está mirando la planta. Tarda unos segundos.</span>
              </div>
            ) : null}

            {identificacion ? (
              <PanelIdentificacion
                identificacion={identificacion}
                tablaDias={tablaIdentificacion}
                onRepetir={() => {
                  setIdentificacion(null)
                  void elegirFotoIdentificar('camara')
                }}
                onPedirTabla={() => {
                  setRiegoElegido(tablaIdentificacion)
                  setRellenoAbierto(true)
                }}
              />
            ) : null}
          </>
        )}
      </Sheet>

      {archivando ? (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center">
          <Spinner label="Archivando" />
        </div>
      ) : null}
    </Pantalla>
  )
}