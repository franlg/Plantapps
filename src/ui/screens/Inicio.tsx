/**
 * INICIO
 * ======
 * Lo primero que ve el usuario: cuántas plantas tiene, cuáles requieren atención
 * ahora mismo y la lista completa. Las dos listas van en sendos acordeones
 * plegables, así que el usuario decide qué ocupa la pantalla sin que las dos se
 * peleen por el sitio. Lo que él pliega a mano se recuerda al volver a la app.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAttention, usePlants } from '@/db/context'
import { Acordeon, Badge, Button, Card, EmptyState, EstadoRiegoChip, PhotoThumb } from '@/ui/components'
import { Cabecera, Iniciales, Pantalla } from '@/ui/screens/Comunes'
import { useEstadosRiego } from '@/ui/screens/datos'
import type { AttentionItem, ID, Plant, WateringStatus } from '@/types'

/**
 * Clave propia en `localStorage`. No se mezcla con `tema` ni con nada de Ajustes:
 * esto es solo cómo dejó el usuario las secciones de esta pantalla.
 */
const CLAVE_SECCIONES = 'inicio-acordeon'

/** Las dos secciones plegables de la pantalla. */
type Seccion = 'atencion' | 'plantas'

/**
 * Estado de plegado **explícito** del usuario.
 *
 * Una sección que no está aquí es que manda su valor por defecto, así que la
 * primera vez no se guarda nada: "Requieren atención" se abre sola si hay algo que
 * mirar y "Todas tus plantas" viene desplegada.
 */
type Plegadas = Partial<Record<Seccion, boolean>>

/** Lee lo que el usuario dejó la última vez. Si no hay nada, los valores por defecto mandan. */
function leerPlegadas(): Plegadas {
  try {
    const crudo = window.localStorage.getItem(CLAVE_SECCIONES)
    if (!crudo) return {}
    const dato: unknown = JSON.parse(crudo)
    if (typeof dato !== 'object' || dato === null) return {}

    const guardado = dato as Record<string, unknown>
    const plegadas: Plegadas = {}
    if (typeof guardado.atencion === 'boolean') plegadas.atencion = guardado.atencion
    if (typeof guardado.plantas === 'boolean') plegadas.plantas = guardado.plantas
    return plegadas
  } catch {
    // Modo privado o un valor guardado que no se entiende: se aplica el comportamiento por defecto.
    return {}
  }
}

/** Guarda el plegado. Solo se llama cuando el usuario toca una cabecera. */
function guardarPlegadas(plegadas: Plegadas): void {
  try {
    window.localStorage.setItem(CLAVE_SECCIONES, JSON.stringify(plegadas))
  } catch {
    // Sin almacenamiento el plegado solo dura esta sesión: no es motivo para romper nada.
  }
}

/** Qué pastilla poner según el motivo: el riego usa el chip, el resto su propio tono. */
function ChipAtencion({ item }: { item: AttentionItem }) {
  if (item.motivo === 'riego_vencido') return <EstadoRiegoChip estado="vencido" />
  if (item.motivo === 'riego_proximo') return <EstadoRiegoChip estado="proximo" />
  if (item.motivo === 'nunca_regada') return <EstadoRiegoChip estado="nunca_regada" />

  return (
    <Badge tone="peligro">
      <span aria-hidden="true">⚠️</span>
      <span>Análisis: hay un problema</span>
    </Badge>
  )
}

/** Fila pulsable de la lista de atención: lleva a la ficha de esa planta. */
function ItemAtencion({ item, onAbrir }: { item: AttentionItem; onAbrir: () => void }) {
  return (
    <li className="mb-2">
      <button
        type="button"
        onClick={onAbrir}
        className="tap-target superficie superficie-faja w-full flex-col items-start justify-start gap-0.5 rounded-2xl p-2.5 text-left hover:border-alerta-300 dark:hover:border-alerta-700"
      >
        <span className="w-full truncate text-base font-semibold text-[var(--text)]">
          {item.plantNombre}
        </span>
        <span className="text-sm text-[var(--text-muted)]">{item.detalle}</span>
        <span className="mt-0.5">
          <ChipAtencion item={item} />
        </span>
      </button>
    </li>
  )
}

/** Tarjeta pulsable de una planta de la lista. */
function TarjetaPlanta({
  planta,
  estado,
  onAbrir,
}: {
  planta: Plant
  estado: WateringStatus | undefined
  onAbrir: () => void
}) {
  return (
    <Card as="li" className="mb-2 p-3">
      <button
        type="button"
        onClick={onAbrir}
        className="tap-target w-full gap-3 rounded-xl text-left hover:bg-brand-50 dark:hover:bg-brand-900/30"
      >
        {planta.fotoPortadaId ? (
          <PhotoThumb
            photoId={planta.fotoPortadaId}
            alt={`Foto de ${planta.nombre}`}
            size="md"
            className="size-16"
          />
        ) : (
          <Iniciales nombre={planta.nombre} className="size-16" />
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-[var(--text)]">
            {planta.nombre}
          </span>
          {planta.especie ? (
            <span className="block truncate text-sm text-[var(--text-muted)]">{planta.especie}</span>
          ) : null}
          {estado ? (
            <span className="mt-1.5 inline-flex">
              <EstadoRiegoChip estado={estado.estado} diasParaRiego={estado.diasParaRiego} />
            </span>
          ) : null}
        </span>
      </button>
    </Card>
  )
}

export function Inicio() {
  const navegar = useNavigate()
  const plantas = usePlants()
  const atencion = useAttention()
  const estados = useEstadosRiego(plantas.map((planta) => planta.id))

  // Solo lo que el usuario pliega a mano se guarda; el resto se deduce del momento.
  const [plegadas, setPlegadas] = useState<Plegadas>(leerPlegadas)

  const hayAtencion = atencion.length > 0
  const abiertaAtencion = plegadas.atencion ?? hayAtencion
  const abiertaPlantas = plegadas.plantas ?? true

  const abrir = (id: ID) => {
    void navegar(`/planta/${id}`)
  }

  const nueva = () => {
    void navegar('/planta/nueva')
  }

  const cambiarSeccion = (seccion: Seccion, abierto: boolean) => {
    const siguiente: Plegadas =
      seccion === 'atencion' ? { ...plegadas, atencion: abierto } : { ...plegadas, plantas: abierto }
    setPlegadas(siguiente)
    guardarPlegadas(siguiente)
  }

  const sinPlantas = plantas.length === 0

  return (
    <Pantalla>
      <Cabecera
        titulo="Mis plantas"
        detalle={
          plantas.length === 1
            ? 'Tienes 1 planta'
            : `Tienes ${plantas.length} plantas`
        }
      />

      {sinPlantas ? (
        <EmptyState
          icono="🌱"
          title="Todavía no hay plantas"
          description="Apunta cuándo las plantaste y cuándo las regas, y hazles una foto para que la IA te diga si toca regar."
          action={<Button size="lg" onClick={nueva}>Añadir primera planta</Button>}
        />
      ) : (
        <>
          <div className="mb-3">
            {/* Con algo dentro, la cabecera se tiñe de ámbar aunque esté plegada: hay que enterarse. */}
            <Acordeon
              titulo="Requieren atención"
              contador={hayAtencion ? <Badge tone="alerta">{atencion.length}</Badge> : null}
              tono={hayAtencion ? 'alerta' : 'neutro'}
              abierto={abiertaAtencion}
              onToggle={(abierto) => cambiarSeccion('atencion', abierto)}
            >
              {hayAtencion ? (
                <ul>
                  {atencion.map((item) => (
                    <ItemAtencion
                      key={`${item.plantId}-${item.motivo}`}
                      item={item}
                      onAbrir={() => abrir(item.plantId)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm">
                  Nada urgente ahora mismo: todas tus plantas están al día.
                </p>
              )}
            </Acordeon>
          </div>

          <div>
            <Acordeon
              titulo="Todas tus plantas"
              contador={<Badge tone="marca">{plantas.length}</Badge>}
              abierto={abiertaPlantas}
              onToggle={(abierto) => cambiarSeccion('plantas', abierto)}
            >
              <ul>
                {plantas.map((planta) => (
                  <TarjetaPlanta
                    key={planta.id}
                    planta={planta}
                    estado={estados[planta.id]}
                    onAbrir={() => abrir(planta.id)}
                  />
                ))}
              </ul>
            </Acordeon>
          </div>
        </>
      )}

      {!sinPlantas ? (
        <div className="mt-3">
          <Button variant="secondary" size="lg" fullWidth onClick={nueva}>
            Añadir planta
          </Button>
        </div>
      ) : null}
    </Pantalla>
  )
}