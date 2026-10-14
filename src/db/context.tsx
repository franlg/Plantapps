import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Db } from '@/services/contracts'
import type { AiAnalysis, AppSettings, AttentionItem, CareEvent, ID, Plant } from '@/types'
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