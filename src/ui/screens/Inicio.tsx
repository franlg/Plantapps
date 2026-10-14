/**
 * INICIO
 * ======
 * Lo primero que ve el usuario: cuántas plantas tiene, cuáles requieren atención
 * ahora mismo y la lista completa. Todo cabe en un pulgar: lista de una columna,
 * tarjetas grandes y el botón de añadir al final, cerca de la mano.
 */

import { useNavigate } from 'react-router-dom'
import { useAttention, usePlants } from '@/db/context'
import { Card, EmptyState, EstadoRiegoChip, Badge, Button, PhotoThumb } from '@/ui/components'
import { Cabecera, Iniciales, Pantalla } from '@/ui/screens/Comunes'
import { useEstadosRiego } from '@/ui/screens/datos'
import type { AttentionItem, ID, Plant, WateringStatus } from '@/types'

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

  const abrir = (id: ID) => {
    void navegar(`/planta/${id}`)
  }

  const nueva = () => {
    void navegar('/planta/nueva')
  }

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

      {atencion.length > 0 ? (
        <section aria-labelledby="titulo-atencion" className="mb-2">
          <h2
            id="titulo-atencion"
            className="mb-2 text-sm font-semibold tracking-wide text-alerta-700 uppercase dark:text-alerta-300"
          >
            Requieren atención
          </h2>
          <ul>
            {atencion.map((item) => (
              <li key={`${item.plantId}-${item.motivo}`}>
                <button
                  type="button"
                  onClick={() => abrir(item.plantId)}
                  className="tap-target w-full flex-col items-start justify-start gap-1 rounded-2xl superficie superficie-faja p-3 text-left hover:border-alerta-300 dark:hover:border-alerta-700"
                >
                  <span className="w-full truncate text-base font-semibold text-[var(--text)]">
                    {item.plantNombre}
                  </span>
                  <span className="text-sm text-[var(--text-muted)]">{item.detalle}</span>
                  <span className="mt-1">
                    <ChipAtencion item={item} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plantas.length === 0 ? (
        <EmptyState
          icono="🌱"
          title="Todavía no hay plantas"
          description="Apunta cuándo las plantaste y cuándo las regas, y hazles una foto para que la IA te diga si toca regar."
          action={<Button size="lg" onClick={nueva}>Añadir primera planta</Button>}
        />
      ) : (
        <section aria-labelledby="titulo-plantas">
          <h2 id="titulo-plantas" className="sr-only">
            Todas tus plantas
          </h2>
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
        </section>
      )}

      {plantas.length > 0 ? (
        <div className="mt-2">
          <Button variant="secondary" size="lg" fullWidth onClick={nueva}>
            Añadir planta
          </Button>
        </div>
      ) : null}
    </Pantalla>
  )
}