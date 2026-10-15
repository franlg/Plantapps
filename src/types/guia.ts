import type { ID, Luz } from './plant'
import type { Confianza } from './ai'

/** Dificultad de mantener la planta, para el usuario novato. */
export type Dificultad = 'facil' | 'media' | 'avanzada'

export const DIFICULTAD_LABELS: Record<Dificultad, string> = {
  facil: 'Fácil',
  media: 'Media',
  avanzada: 'Avanzada',
}

/** Un apartado de la guía, listo para mostrar. */
export interface SeccionGuia {
  /** 'Riego', 'Luz', 'Sustrato'... */
  titulo: string
  /** Texto en lenguaje sencillo. */
  contenido: string
  /** Consejos sueltos, opcional. */
  puntos?: string[]
}

/** Lo que devuelve el modelo, ya validado con Zod. */
export interface GuiaCuidadosDraft {
  nombreComun: string
  nombreCientifico: string
  familia: string
  /** 1-3 frases: qué es esta planta y qué le gusta. */
  resumen: string
  /** Siempre 6, en este orden: riego, luz, sustrato, temperatura, fertilización, problemas. */
  secciones: SeccionGuia[]
  /** Frecuencia de riego que recomienda, o null si no puede estimarla. */
  frecuenciaRiegoDias: number | null
  dificultad: Dificultad
  /** Si la guía se basa en datos que ya tenemos de la planta, no solo en la especie. */
  basadaEnContexto: boolean
}

/** Guía guardada, vinculada a su planta. */
export interface GuiaCuidados extends GuiaCuidadosDraft {
  id: ID
  plantId: ID
  /** ISO datetime de generación. */
  generadoEn: string
  modelo: string
}

/** Entrada para pedir una guía. */
export interface GuiaInput {
  plantId: ID
  /** Foto opcional: si la hay, la guía se afina a esa planta concreta. */
  foto?: Blob
  contexto: {
    nombre: string
    especie?: string
    maceta?: string
    ubicacion?: string
    luz?: string
    diasDesdePlantado: number | null
    ultimoRiego: string | null
  }
  modelo?: string
}

/** La identificación que devuelve el modelo cuando no sabes qué planta es. */
export interface IdentificacionDraft {
  /** `null` si la foto no permite decidir: entonces la app no rellena nada. */
  especie: string | null
  nombreComun: string | null
  familia: string | null
  confianza: Confianza
  /** Por qué cree que es esa, en una frase. */
  razon: string
  /** Otras especies parecidas, por si no te convence. */
  alternativas: string[]
  /** Frecuencia de riego sugerida, o null. */
  frecuenciaRiegoDias: number | null
  /** Luz sugerida, o null. */
  luz: Luz | null
}

/** Entrada para pedir una identificación. */
export interface IdentificarInput {
  plantId: ID
  foto: Blob
  /** Lo que el usuario ya sabe, para que no se lo pregunte. */
  pistas?: string
  modelo?: string
}