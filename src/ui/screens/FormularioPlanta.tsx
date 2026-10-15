/**
 * ALTA Y EDICIÓN DE UNA PLANTA
 * ===========================
 * La misma pantalla para las dos cosas: en `/planta/nueva` crea, en
 * `/planta/:id/editar` guarda los cambios de la planta que ya existe.
 *
 * Solo el nombre es obligatorio: todo lo demás sirve para afinar el aviso de
 * riego y para que la IA sepa de qué planta le están hablando.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDb, usePlant } from '@/db/context'
import { guardarFoto, pickPhoto } from '@/services/photos'
import { frecuenciaSugerida } from '@/services/reminders'
import { formatDateEs, fromDateInputValue, relativeEs, toDateInputValue } from '@/lib/dates'
import {
  Button,
  Card,
  ConfirmDialog,
  DateInput,
  ErrorBanner,
  Field,
  PhotoThumb,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from '@/ui/components'
import { Cabecera, Pantalla, TituloSeccion } from '@/ui/screens/Comunes'
import { OPCIONES_LUZ, OPCION_VACIA, aLuz, numeroOpcional, textoOpcional } from '@/ui/screens/datos'
import type { CareEvent, NewPlant } from '@/types'

/** Texto del error del nombre, en una sola frase. */
const ERROR_NOMBRE = 'Ponle un nombre a la planta para reconocerla.'

/**
 * Nota con la que el formulario marca el riego que él mismo crea o actualiza.
 * Sirve para reconocerlo después y no duplicarlo: los riegos que registra el
 * usuario desde la ficha de la planta no llevan esta nota y no se tocan.
 */
const NOTA_RIEGO_ALTA = 'Riego registrado al dar de alta la planta'

/** El riego que este formulario dejó puesto para una planta, si lo hay. */
function riegoDelFormulario(eventos: CareEvent[]): CareEvent | undefined {
  return eventos.find((evento) => evento.tipo === 'riego' && evento.nota === NOTA_RIEGO_ALTA)
}

export function FormularioPlanta() {
  const { id } = useParams<{ id: string }>()
  const navegar = useNavigate()
  const db = useDb()

  const editando = typeof id === 'string' && id !== ''
  const planta = usePlant(editando ? id : undefined)

  const [inicializado, setInicializado] = useState(!editando)
  const [nombre, setNombre] = useState('')
  const [especie, setEspecie] = useState('')
  const [fecha, setFecha] = useState('')
  const [ultimoRiego, setUltimoRiego] = useState('')
  const [frecuencia, setFrecuencia] = useState('')
  const [maceta, setMaceta] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [luz, setLuz] = useState('')
  const [notas, setNotas] = useState('')
  const [fotoId, setFotoId] = useState<string | undefined>(undefined)

  const [errorNombre, setErrorNombre] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [borrarAbierto, setBorrarAbierto] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const fotoRef = useRef<string | undefined>(undefined)

  // Los campos se rellenan una vez por planta. Se depende del id, no del objeto,
  // para no borrar lo que el usuario está escribiendo cuando la base de datos notifica.
  const plantaId = planta?.id
  useEffect(() => {
    if (!plantaId) return
    const actual = db.plants.get(plantaId)
    void actual.then((p) => {
      if (!p) {
        setInicializado(true)
        return
      }
      setNombre(p.nombre)
      setEspecie(p.especie ?? '')
      setFecha(toDateInputValue(p.fechaPlantado))
      setFrecuencia(p.frecuenciaRiegoDias != null ? String(p.frecuenciaRiegoDias) : '')
      setMaceta(p.maceta ?? '')
      setUbicacion(p.ubicacion ?? '')
      setLuz(p.luz ?? '')
      setNotas(p.notas ?? '')
      setFotoId(p.fotoPortadaId)
      fotoRef.current = p.fotoPortadaId
      setInicializado(true)
    })
    // El campo «Último riego» no está en la planta: sale de su historial.
    void db.events.listByPlant(plantaId).then((eventos) => {
      setUltimoRiego(toDateInputValue(riegoDelFormulario(eventos)?.fecha))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantaId])

  /** Si escribe una especie, la app propone una frecuencia de riego. */
  const sugerencia = useMemo(() => {
    if (especie.trim() === '' || frecuencia.trim() !== '') return null
    return frecuenciaSugerida(especie)
  }, [especie, frecuencia])

  const elegirFoto = async (fuente: 'camara' | 'galeria') => {
    setError(null)
    try {
      const archivo = await pickPhoto(fuente)
      if (!archivo) return
      const guardada = await guardarFoto(db, archivo)
      setFotoId(guardada.id)
      fotoRef.current = guardada.id
    } catch (problema) {
      setError(problema instanceof Error ? problema.message : 'No se ha podido cargar la foto.')
    }
  }

  /**
   * Deja el «Último riego» como un evento del historial, no como un dato de la
   * planta. Si la planta ya tiene un riego puesto por este formulario, se
   * actualiza ese mismo evento (cambiar la fecha no lo duplica) y si la fecha se
   * deja vacía, se quita; si no hay ninguno, se crea. Los riegos que registró el
   * usuario desde la ficha de la planta no se tocan nunca.
   */
  const sincronizarRiego = async (plantaAEditar: string, fechaEscrita: string) => {
    const eventos = await db.events.listByPlant(plantaAEditar)
    const previo = riegoDelFormulario(eventos)

    if (previo === undefined) {
      if (fechaEscrita !== '') {
        await db.events.create({
          plantId: plantaAEditar,
          tipo: 'riego',
          fecha: fromDateInputValue(fechaEscrita),
          nota: NOTA_RIEGO_ALTA,
        })
      }
      return
    }

    if (fechaEscrita === '') {
      await db.events.remove(previo.id)
      return
    }

    const fechaNueva = fromDateInputValue(fechaEscrita)
    if (previo.fecha === fechaNueva) return
    await db.events.update(previo.id, { fecha: fechaNueva, nota: NOTA_RIEGO_ALTA })
  }

  const guardar = async () => {
    const nombreLimpio = nombre.trim()
    if (nombreLimpio === '') {
      setErrorNombre(ERROR_NOMBRE)
      return
    }

    setGuardando(true)
    setError(null)
    setErrorNombre(undefined)

    const datos: NewPlant = {
      nombre: nombreLimpio,
      especie: textoOpcional(especie),
      fechaPlantado: fecha === '' ? undefined : fecha,
      frecuenciaRiegoDias: numeroOpcional(frecuencia),
      maceta: textoOpcional(maceta),
      ubicacion: textoOpcional(ubicacion),
      luz: aLuz(luz),
      notas: textoOpcional(notas),
    }

    try {
      const guardada = editando && plantaId
        ? await db.plants.update(plantaId, datos)
        : await db.plants.create(datos)

      if (fotoRef.current && fotoRef.current !== guardada.fotoPortadaId) {
        await db.plants.setFotoPortada(guardada.id, fotoRef.current)
      }

      // En alta la planta aún no existía, así que el riego se crea con su id ya
      // asignado; en edición se reutiliza el que hubiera puesto el formulario.
      // Sin fecha y sin riego previo no hay nada que hacer.
      if (ultimoRiego !== '' || editando) {
        await sincronizarRiego(editando && plantaId ? plantaId : guardada.id, ultimoRiego)
      }

      navegar(-1)
    } catch (problema) {
      setError(problema instanceof Error ? problema.message : 'Inténtalo otra vez.')
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async () => {
    if (!plantaId) return
    setEliminando(true)
    try {
      await db.plants.remove(plantaId)
      setBorrarAbierto(false)
      navegar('/', { replace: true })
    } catch (problema) {
      setError(problema instanceof Error ? problema.message : 'No se ha podido borrar.')
    } finally {
      setEliminando(false)
    }
  }

  if (editando && !inicializado) {
    return (
      <Pantalla>
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Cargando la planta" />
        </div>
      </Pantalla>
    )
  }

  if (editando && inicializado && !planta) {
    return (
      <Pantalla>
        <Cabecera titulo="No encontramos esa planta" />
        <Card>
          <p className="text-[var(--text-muted)]">
            Puede que la hayas borrado. Vuelve al inicio para ver tus plantas.
          </p>
        </Card>
        <div className="mt-4">
          <Button variant="secondary" fullWidth onClick={() => navegar('/', { replace: true })}>
            Ir al inicio
          </Button>
        </div>
      </Pantalla>
    )
  }

  return (
    <Pantalla>
      <Cabecera
        titulo={editando ? 'Editar planta' : 'Nueva planta'}
        detalle={
          editando && planta?.fechaPlantado
            ? `Plantada el ${formatDateEs(planta.fechaPlantado)} · ${relativeEs(planta.fechaPlantado)}`
            : 'Con el nombre y la fecha ya vale para empezar.'
        }
      />

      {error ? (
        <div className="mb-4">
          <ErrorBanner title="No se ha podido guardar" message={error} onDismiss={() => setError(null)} />
        </div>
      ) : null}

      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          void guardar()
        }}
      >
        <Field label="Nombre" required error={errorNombre} hint="Como lo dirías en casa: «Monstera del salón».">
          <TextInput
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Monstera del salón"
            autoComplete="off"
          />
        </Field>

        <Field label="Especie" hint="Opcional. Con la especie la app te sugiere cada cuánto regar.">
          <TextInput
            value={especie}
            onChange={(e) => setEspecie(e.target.value)}
            placeholder="Monstera deliciosa"
            autoComplete="off"
          />
        </Field>

        {sugerencia !== null ? (
          <p className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>
              Sugerido para {especie.trim()}: cada {sugerencia}{' '}
              {sugerencia === 1 ? 'día' : 'días'}. Puedes cambiarlo.
            </span>
            <Button variant="ghost" size="sm" onClick={() => setFrecuencia(String(sugerencia))}>
              Usar {sugerencia} días
            </Button>
          </p>
        ) : null}

        <Field label="Fecha de plantado" hint="Si la pones, la app avisa del tiempo que lleva fuera de su maceta.">
          <DateInput value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>

        <Field
          label="Último riego"
          hint="Opcional. La app lo guarda como un riego más del historial, no como un dato de la planta."
        >
          <DateInput value={ultimoRiego} onChange={(e) => setUltimoRiego(e.target.value)} />
        </Field>

        <Field
          label="Cada cuántos días regar"
          hint="Déjalo vacío si prefieres que la app lo deduzca de la especie."
        >
          <TextInput
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={frecuencia}
            onChange={(e) => setFrecuencia(e.target.value)}
            placeholder="7"
          />
        </Field>

        <Field label="Maceta" hint="Opcional. Ejemplo: «maceta de 18 cm».">
          <TextInput value={maceta} onChange={(e) => setMaceta(e.target.value)} placeholder="18 cm" />
        </Field>

        <Field label="Ubicación" hint="Opcional. Ejemplo: «salón, junto a la ventana».">
          <TextInput
            value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)}
            placeholder="Salón, junto a la ventana"
          />
        </Field>

        <Field label="Luz" hint="Opcional. Le sirve a la IA para saber si la planta vive con poca luz.">
          <Select
            options={[OPCION_VACIA, ...OPCIONES_LUZ]}
            value={luz}
            onChange={(e) => setLuz(e.target.value)}
          />
        </Field>

        <Field label="Notas" hint="Opcional. Todo lo que quieras acordarte de esta planta.">
          <TextArea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="La tutoré en marzo porque se doblaba hacia la ventana."
            rows={4}
          />
        </Field>

        <div className="rounded-2xl">
          <p className="mb-1.5 text-sm font-semibold text-[var(--text)]">Foto</p>
          <div className="flex items-center gap-3">
            {fotoId ? (
              <PhotoThumb photoId={fotoId} alt={`Foto elegida para ${nombre || 'la planta'}`} size="lg" />
            ) : (
              <div className="flex size-24 items-center justify-center rounded-2xl bg-brand-100 text-3xl dark:bg-brand-900">
                <span aria-hidden="true">📷</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button variant="secondary" size="sm" onClick={() => void elegirFoto('camara')}>
                Hacer foto
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void elegirFoto('galeria')}>
                Elegir de la galería
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button type="submit" size="lg" fullWidth loading={guardando}>
            {editando ? 'Guardar cambios' : 'Guardar planta'}
          </Button>
          <Button variant="secondary" fullWidth onClick={() => navegar(-1)}>
            Cancelar
          </Button>
        </div>
      </form>

      {editando ? (
        <>
          <TituloSeccion>Zona peligrosa</TituloSeccion>
          <Button variant="danger" fullWidth onClick={() => setBorrarAbierto(true)}>
            Borrar esta planta
          </Button>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Si solo quieres quitarla de la lista sin perder su historial, archívala desde la ficha de la planta.
          </p>
        </>
      ) : null}

      <ConfirmDialog
        open={borrarAbierto}
        title="¿Borrar la planta?"
        message={`Se borra ${planta?.nombre ?? 'la planta'} y todo su historial: riegos, comentarios y análisis. No se puede deshacer.`}
        confirmLabel="Sí, borrar"
        cancelLabel="Cancelar"
        onConfirm={() => void borrar()}
        onCancel={() => setBorrarAbierto(false)}
        destructive
      />

      {eliminando ? (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center">
          <Spinner label="Borrando" />
        </div>
      ) : null}
    </Pantalla>
  )
}