import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Db } from '@/services/contracts'
import type {
  AiAnalysis,
  AppSettings,
  AttentionItem,
  CareEvent,
  FotoProgreso,
  GuiaCuidados,
  ID,
  Plant,
} from '@/types'
import { nowIso } from '@/lib/dates'
import { SETTINGS_POR_DEFECTO } from '@/types'

const DbContext = createContext<Db | null>(null)

export function DbProvider({ db, children }: { db: Db; children: ReactNode }) {
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>
}

export function useDb(): Db {
  const db = useContext(DbContext)
  if (!db) throw new Error('useDb() debe usarse dentro de <DbProvider>')
  return db
}

/**
 * Lee de la base de datos y se vuelve a leer sola cuando algo cambia.
 * Es un `useSyncExternalStore` manual: simple y sin dependencias extra.
 */
function useQuery<T>(select: (db: Db) => Promise<T>, deps: unknown[], initial: T): T {
  const db = useDb()
  const [data, setData] = useState<T>(initial)

  useEffect(() => {
    let alive = true
    const load = () => {
      select(db)
        .then((result) => {
          if (alive) setData(result)
        })
        .catch(() => {
          /* los errores se muestran en la acción que los provoca */
        })
    }
    load()
    const unsubscribe = db.subscribe(load)
    return () => {
      alive = false
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ...deps])

  return data
}

/** Lista de plantas, ordenadas alfabéticamente. */
export function usePlants(opts?: { incluirArchivadas?: boolean }): Plant[] {
  const incluirArchivadas = opts?.incluirArchivadas ?? false
  return useQuery<Plant[]>((db) => db.plants.list({ incluirArchivadas }), [incluirArchivadas], [])
}

/** Una planta concreta. */
export function usePlant(id: ID | undefined): Plant | undefined {
  return useQuery<Plant | undefined>((db) => (id ? db.plants.get(id) : Promise.resolve(undefined)), [id], undefined)
}

/** Historial de una planta, más reciente primero. */
export function useTimeline(plantId: ID | undefined): CareEvent[] {
  return useQuery<CareEvent[]>((db) => (plantId ? db.events.listByPlant(plantId) : Promise.resolve([])), [plantId], [])
}

/** Análisis de IA de una planta, más recientes primero. */
export function useAnalyses(plantId: ID | undefined): AiAnalysis[] {
  return useQuery<AiAnalysis[]>((db) => (plantId ? db.analyses.listByPlant(plantId) : Promise.resolve([])), [plantId], [])
}

/** Guía de cuidados vigente de una planta, o undefined si nunca se ha pedido. */
export function useGuia(plantId: ID | undefined): GuiaCuidados | undefined {
  return useQuery<GuiaCuidados | undefined>(
    (db) => (plantId ? db.guides.get(plantId) : Promise.resolve(undefined)),
    [plantId],
    undefined,
  )
}

/**
 * Fotos del historial visual de una planta, de más reciente a más antigua.
 * Devuelve solo los ids y los metadatos: la interfaz usa `PhotoThumb` con el id,
 * que ya sabe pedirle la URL a la base de datos.
 */
export function useFotosProgreso(plantId: ID | undefined): FotoProgreso[] {
  return useQuery<FotoProgreso[]>(
    async (db) => {
      if (!plantId) return []
      const planta = await db.plants.get(plantId)
      if (!planta) return []

      const analisis = await db.analyses.listByPlant(plantId)
      const fotos = await db.photos.byIds(
        analisis.map((a) => a.photoId).filter((id): id is ID => Boolean(id)),
      )
      const porId = new Map(fotos.map((f) => [f.id, f]))

      const entradas: FotoProgreso[] = []
      for (const a of analisis) {
        if (!a.photoId || !porId.has(a.photoId)) continue
        entradas.push({
          id: a.photoId,
          fecha: a.fecha,
          origen: 'analisis',
          analysisId: a.id,
          veredicto: a.veredicto,
        })
      }

      if (planta.fotoPortadaId && porId.has(planta.fotoPortadaId)) {
        // La portada va la primera si no es ya la del análisis más reciente.
        const yaEstaba = entradas[0]?.id === planta.fotoPortadaId
        if (!yaEstaba) {
          entradas.unshift({ id: planta.fotoPortadaId, fecha: planta.actualizadoEn, origen: 'portada' })
        }
      }

      return entradas
    },
    [plantId],
    [],
  )
}

/**
 * Registrar un riego sin salir de la pantalla donde estás.
 *
 * Devuelve la planta que se está regando (`pendiente`), para que la tarjeta
 * muestre que está en marcha, y la función `registrar`, que nunca lanza: si algo
 * falla lo deja anotado en `error` para que la interfaz lo muestre.
 */
export function useRegistrarRiego(): {
  registrar: (plantId: ID, nota?: string) => Promise<boolean>
  pendiente: ID | null
  error: string | null
  descartarError: () => void
} {
  const db = useDb()
  const [pendiente, setPendiente] = useState<ID | null>(null)
  const [error, setError] = useState<string | null>(null)

  const registrar = useMemo(
    () => async (plantId: ID, nota?: string) => {
      setPendiente(plantId)
      setError(null)
      try {
        await db.events.create({ plantId, tipo: 'riego', fecha: nowIso(), nota })
        return true
      } catch (problema) {
        setError(problema instanceof Error ? problema.message : 'No se ha podido registrar el riego.')
        return false
      } finally {
        setPendiente(null)
      }
    },
    [db],
  )

  return { registrar, pendiente, error, descartarError: () => setError(null) }
}

/** Plantas que requieren atención, ordenadas por urgencia. */
export function useAttention(): AttentionItem[] {
  return useQuery<AttentionItem[]>((db) => db.reminders.attention(), [], [])
}

/** ObjectURL de una foto, listo para <img src>. */
export function usePhotoUrl(photoId: ID | undefined): string | undefined {
  const db = useDb()
  const [url, setUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    let alive = true
    if (!photoId) {
      setUrl(undefined)
      return
    }
    db.photos
      .url(photoId)
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [db, photoId])

  return url
}

/** Ajustes + función para guardarlos. */
export function useSettings(): {
  settings: AppSettings
  guardar: (patch: Partial<AppSettings>) => Promise<AppSettings>
} {
  const db = useDb()
  const settings = useQuery<AppSettings>((d) => d.settings.get(), [], SETTINGS_POR_DEFECTO)

  const guardar = useMemo(() => (patch: Partial<AppSettings>) => db.settings.save(patch), [db])

  return { settings, guardar }
}