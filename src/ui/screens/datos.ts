/**
 * UTILIDADES COMPARTIDAS DE LAS PANTALLAS
 * =========================================
 * Hooks que hablan con la base de datos y funciones de formato que usan varias
 * pantallas. Aquí no hay JSX a propósito: solo lógica, para que cada pantalla
 * se limite a pintar.
 */

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useDb } from '@/db/context'
import { daysSince, formatDateEs, relativeEs, todayIso, toDate } from '@/lib/dates'
import { AiError, EVENTO_LABELS, LUZ_LABELS } from '@/types'
import type {
  AiErrorCode,
  CareEvent,
  Confianza,
  Dificultad,
  GuiaInput,
  ID,
  IdentificacionDraft,
  Luz,
  Plant,
  PlantContext,
  WateringStatus,
} from '@/types'

// ---------------------------------------------------------------------------
// Estado de riego de varias plantas a la vez
// ---------------------------------------------------------------------------

/**
 * Estado de riego de una lista de plantas.
 *
 * El motor de recordatorios es local (lee de memoria), así que cargarlo todo de
 * una vez es instantáneo. Se recarga cuando cambia la lista de plantas o la
 * versión de la base de datos (por ejemplo, después de registrar un riego).
 */
export function useEstadosRiego(plantIds: readonly ID[]): Record<ID, WateringStatus> {
  const db = useDb()
  const [estados, setEstados] = useState<Record<ID, WateringStatus>>({})

  const clave = plantIds.join('|')
  const version = db.version

  useEffect(() => {
    let vivo = true
    const ids = clave === '' ? [] : clave.split('|')

    if (ids.length === 0) {
      setEstados({})
      return
    }

    void Promise.all(ids.map((id) => db.reminders.estado(id))).then((lista) => {
      if (!vivo) return
      const siguiente: Record<ID, WateringStatus> = {}
      for (const estado of lista) siguiente[estado.plantId] = estado
      setEstados(siguiente)
    })

    return () => {
      vivo = false
    }
  }, [db, clave, version])

  return estados
}

// ---------------------------------------------------------------------------
// Vista previa de un archivo local (foto recién hecha)
// ---------------------------------------------------------------------------

/** ¿El entorno puede crear direcciones de objeto? En jsdom no se puede. */
function soportaObjectURL(): boolean {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
}

/**
 * URL temporal para previsualizar una foto que todavía no está guardada.
 * Se anula en cuanto cambia la foto o se desmonta el componente.
 */
export function useVistaFoto(archivo: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!archivo || !soportaObjectURL()) {
      setUrl(null)
      return
    }

    const creada = URL.createObjectURL(archivo)
    setUrl(creada)

    return () => {
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(creada)
    }
  }, [archivo])

  return url
}

// ---------------------------------------------------------------------------
// Tema claro / oscuro
// ---------------------------------------------------------------------------

export type Tema = 'claro' | 'oscuro'

/** Clave en `localStorage`. Se escribe aquí y no en el servicio worker. */
export const CLAVE_TEMA = 'tema'

/** Pone o quita la clase `dark` del `<html>`, que es lo que lee el tema. */
export function aplicarTema(tema: Tema): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', tema === 'oscuro')
}

function temaGuardado(): Tema | null {
  if (typeof window === 'undefined') return null
  try {
    const valor = window.localStorage.getItem(CLAVE_TEMA)
    return valor === 'claro' || valor === 'oscuro' ? valor : null
  } catch {
    // Modo privado o almacenamiento deshabilitado: seguimos con la preferencia del sistema.
    return null
  }
}

/** Tema inicial: lo que eligió el usuario y, si no hay nada, lo que pide el sistema. */
export function temaInicial(): Tema {
  if (typeof window === 'undefined') return 'claro'
  const guardado = temaGuardado()
  if (guardado) return guardado
  if (typeof window.matchMedia !== 'function') return 'claro'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}

function persistirTema(tema: Tema): void {
  try {
    window.localStorage.setItem(CLAVE_TEMA, tema)
  } catch {
    // Sin almacenamiento el tema solo dura esta sesión: no es motivo para romper nada.
  }
  aplicarTema(tema)
}

/** Tema de la interfaz, con la preferencia del sistema como punto de partida. */
export function useTema(): { tema: Tema; cambiarTema: (tema: Tema) => void } {
  const [tema, setTema] = useState<Tema>(temaInicial)

  const cambiarTema = useCallback((nuevo: Tema) => {
    setTema(nuevo)
    persistirTema(nuevo)
  }, [])

  return { tema, cambiarTema }
}

// ---------------------------------------------------------------------------
// Errores de la IA, traducidos a algo que se pueda hacer
// ---------------------------------------------------------------------------

export interface AvisoError {
  /** Qué ha fallado, en una frase corta. */
  titulo: string
  /** Qué hacer para arreglarlo. */
  mensaje: string
  /** Ruta a la que llevar al usuario, si hay una. */
  irA: '/ajustes' | null
}

const ERRORES_IA: Record<AiErrorCode, AvisoError> = {
  sin_clave: {
    titulo: 'Falta la clave de la IA',
    mensaje: 'Añade tu clave gratuita en Ajustes y vuelve a intentarlo.',
    irA: '/ajustes',
  },
  sin_red: {
    titulo: 'Sin conexión',
    mensaje: 'El análisis necesita internet. Los riegos y el historial se siguen guardando.',
    irA: null,
  },
  cuota: {
    titulo: 'Sin consultas por hoy',
    mensaje: 'Has usado todas las consultas gratuitas de hoy. Prueba mañana.',
    irA: null,
  },
  modelo_no_disponible: {
    titulo: 'El modelo está saturado',
    mensaje: 'Ya se ha probado con el modelo de respaldo. Reintenta en un momento.',
    irA: null,
  },
  respuesta_invalida: {
    titulo: 'La IA no ha entendido la foto',
    mensaje: 'Prueba con otra foto, más cerca de la planta y bien iluminada.',
    irA: null,
  },
  desconocido: {
    titulo: 'No se ha podido analizar la planta',
    mensaje: '',
    irA: null,
  },
}

/** Convierte cualquier error (del servicio de IA o de la base de datos) en un aviso en español. */
export function avisoError(error: unknown, porDefecto = 'Algo ha ido mal'): AvisoError {
  if (error instanceof AiError) {
    const base = ERRORES_IA[error.codigo]
    return { ...base, mensaje: base.mensaje !== '' ? base.mensaje : error.message }
  }

  const detalle = error instanceof Error && error.message !== '' ? error.message : ''
  return { titulo: porDefecto, mensaje: detalle, irA: null }
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

/** "Octubre 2026". */
export function tituloMes(iso: string): string {
  const texto = format(toDate(iso), 'MMMM yyyy', { locale: es })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** La hora solo si aporta: si el evento es de hoy, "Hoy, 18:30". */
export function fechaLegible(iso: string): string {
  const fecha = toDate(iso)
  const hora = format(fecha, 'HH:mm')
  if (format(fecha, 'yyyy-MM-dd') === todayIso()) return `Hoy, ${hora}`
  if (format(fecha, 'yyyy') === format(new Date(), 'yyyy')) return `${formatDateEs(fecha)}, ${hora}`
  return formatDateEs(fecha)
}

export interface GrupoMes {
  clave: string
  titulo: string
  eventos: CareEvent[]
}

/** Agrupa un historial (de más reciente a más antiguo) por mes. */
export function agruparPorMes(eventos: CareEvent[]): GrupoMes[] {
  const grupos: GrupoMes[] = []

  for (const evento of eventos) {
    const clave = format(toDate(evento.fecha), 'yyyy-MM')
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.clave === clave) {
      ultimo.eventos.push(evento)
    } else {
      grupos.push({ clave, titulo: tituloMes(evento.fecha), eventos: [evento] })
    }
  }

  return grupos
}

// ---------------------------------------------------------------------------
// Contexto que se le manda al modelo
// ---------------------------------------------------------------------------

/** "hace 3 días: Riego". Una línea por evento, como lo pide el prompt. */
export function lineaHistorial(evento: CareEvent): string {
  return `${relativeEs(evento.fecha)}: ${EVENTO_LABELS[evento.tipo]}`
}

/** Datos de la planta + su historial, que es lo que el modelo no puede ver en la foto. */
export function contextoParaIa(
  planta: Plant,
  eventos: CareEvent[],
  estado: WateringStatus | undefined,
): PlantContext {
  const ultimoRiego = eventos.find((evento) => evento.tipo === 'riego')?.fecha ?? null

  return {
    nombre: planta.nombre,
    especie: planta.especie,
    diasDesdePlantado: estado?.diasDesdePlantado ?? null,
    maceta: planta.maceta,
    ubicacion: planta.ubicacion,
    luz: planta.luz ? LUZ_LABELS[planta.luz] : undefined,
    notas: planta.notas,
    ultimoRiego,
    diasDesdeUltimoRiego: estado?.diasDesdeRiego ?? null,
    frecuenciaRiegoDias: planta.frecuenciaRiegoDias ?? estado?.frecuenciaDias ?? null,
    historial: eventos.slice(0, 10).map(lineaHistorial),
  }
}

/**
 * Datos de la planta para escribirle la guía de cuidados.
 *
 * No lleva el historial: para un texto de consulta importa cómo está la planta
 * ahora (maceta, ubicación, luz, cuánto lleva plantada y cuándo se regó por
 * última vez), no lo que le ha pasado antes.
 */
export function contextoParaGuia(planta: Plant, ultimoRiego: string | null): GuiaInput['contexto'] {
  return {
    nombre: planta.nombre,
    especie: planta.especie,
    maceta: planta.maceta,
    ubicacion: planta.ubicacion,
    luz: planta.luz ? LUZ_LABELS[planta.luz] : undefined,
    diasDesdePlantado: planta.fechaPlantado ? daysSince(planta.fechaPlantado) : null,
    ultimoRiego,
  }
}

// ---------------------------------------------------------------------------
// Guía de cuidados e identificación
// ---------------------------------------------------------------------------

/** A partir de aquí una guía puede hablar de una planta que ya no es la misma. */
export const DIAS_GUIA_VIGENTE = 180

/** `true` si la guía tiene más de medio año y conviene ofrecer regenerarla. */
export function guiaDesactualizada(generadoEn: string, now: Date = new Date()): boolean {
  const dias = daysSince(generadoEn, now)
  return dias !== null && dias > DIAS_GUIA_VIGENTE
}

/** Verde si la planta se sostiene sola, gris si hay que vigilarla, ámbar si es para experts. */
export function tonoDificultad(dificultad: Dificultad): 'ok' | 'neutro' | 'alerta' {
  if (dificultad === 'facil') return 'ok'
  if (dificultad === 'media') return 'neutro'
  return 'alerta'
}

/** El semáforo de "cuánto se fía el modelo": verde, ámbar, rojo. */
export function tonoConfianza(confianza: Confianza): 'ok' | 'alerta' | 'peligro' {
  if (confianza === 'alta') return 'ok'
  if (confianza === 'media') return 'alerta'
  return 'peligro'
}

/**
 * Lo que ya sabemos de la planta, en una línea por dato. Va como pista al
 * identificar: no es obligatorio (si no se sabe nada, no se dice nada), pero
 * afina mucho la respuesta.
 */
export function pistasParaIdentificar(planta: Plant): string {
  const partes: Array<string | null> = [
    planta.ubicacion ? `Está en: ${planta.ubicacion} (planta de casa).` : 'No se sabe si es de casa o de exterior.',
    planta.luz ? `Le da: ${LUZ_LABELS[planta.luz].toLowerCase()}.` : null,
    planta.maceta ? `Maceta: ${planta.maceta}.` : null,
  ]

  return partes.filter((parte): parte is string => parte !== null).join(' ')
}

/**
 * Las líneas del diálogo "¿relleno los datos?": qué campo cambia y a qué valor.
 * `frecuencia` permite que el usuario se quede con la cifra de la tabla de la
 * app en lugar de la del modelo: las dos se muestran y él elige.
 */
export function resumenCambios(
  identificacion: IdentificacionDraft,
  frecuencia: number | null = null,
): string[] {
  const dias = frecuencia ?? identificacion.frecuenciaRiegoDias
  const lineas: string[] = []

  if (identificacion.especie) lineas.push(`especie: ${identificacion.especie}`)
  if (dias != null) lineas.push(`riego cada ${dias} días`)
  if (identificacion.luz) lineas.push(`luz: ${LUZ_LABELS[identificacion.luz].toLowerCase()}`)

  return lineas
}

// ---------------------------------------------------------------------------
// Varios
// ---------------------------------------------------------------------------

/** Tono del semáforo para la salud 0-100 que devuelve el modelo. */
export function tonoSalud(salud: number): 'ok' | 'alerta' | 'peligro' {
  if (salud >= 70) return 'ok'
  if (salud >= 40) return 'alerta'
  return 'peligro'
}

const COLORES_SALUD: Record<'ok' | 'alerta' | 'peligro', string> = {
  ok: 'bg-ok-500',
  alerta: 'bg-alerta-500',
  peligro: 'bg-peligro-500',
}

export function colorSalud(salud: number): string {
  return COLORES_SALUD[tonoSalud(salud)]
}

/** Convierte el valor de un `<select>` en un valor de luz, o `undefined`. */
export function aLuz(valor: string): Luz | undefined {
  const valores: readonly string[] = Object.keys(LUZ_LABELS)
  return valores.includes(valor) ? (valor as Luz) : undefined
}

/** Opciones del selector de luz, en el orden de `LUZ_LABELS`. */
export const OPCIONES_LUZ: Array<{ value: string; label: string }> = (
  Object.keys(LUZ_LABELS) as Luz[]
).map((valor) => ({ value: valor, label: LUZ_LABELS[valor] }))

/** Opción "no he puesto nada", para los selectores que admiten quedar en blanco. */
export const OPCION_VACIA = { value: '', label: 'Sin especificar' }

/** Limpia un texto de un campo opcional: vacío = `undefined`. */
export function textoOpcional(valor: string): string | undefined {
  const limpio = valor.trim()
  return limpio === '' ? undefined : limpio
}

/** Número de un campo de texto, o `undefined` si no es un entero positivo. */
export function numeroOpcional(valor: string): number | undefined {
  const limpio = valor.trim()
  if (limpio === '') return undefined
  const numero = Number.parseInt(limpio, 10)
  if (!Number.isFinite(numero) || numero <= 0) return undefined
  return numero
}