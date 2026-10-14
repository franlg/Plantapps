/**
 * FOTOS
 * ====
 * Punto de entrada del servicio: compresión, selección y guardado de imágenes.
 */

import type { Db } from '@/services/contracts'
import type { StoredPhoto } from '@/types'
import { comprimirImagen } from './compress'
import type { OpcionesCompresion } from './compress'

export * from './compress'
export * from './picker'

/** Unidades binarias (1024) para mostrar tamaños de archivo. */
const UNIDADES = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * Comprime la foto (principal + miniatura) y la guarda en la base de datos local.
 * Ambas versiones se persisten: la miniatura es la que usan las listas, así que
 * así no hay que decodificar imágenes de 1280 px cada vez que se dibuja una tarjeta.
 */
export async function guardarFoto(
  db: Db,
  entrada: File | Blob,
  opciones?: OpcionesCompresion,
): Promise<StoredPhoto> {
  const { blob, thumb, width, height } = await comprimirImagen(entrada, opciones)
  const guardada = await db.photos.put(blob, { thumb, width, height })

  return {
    ...guardada,
    thumb,
    width,
    height,
    bytes: blob.size,
    mime: blob.type || guardada.mime,
  }
}

/**
 * Tamaño legible en español: '512 B', '1,5 KB', '1,2 MB'.
 * Usa 1024 como base y una coma decimal; los valores enteros no llevan decimales.
 */
export function formatearBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  let valor = bytes
  let indice = 0
  while (valor >= 1024 && indice < UNIDADES.length - 1) {
    valor /= 1024
    indice += 1
  }

  const unidad = UNIDADES[indice]
  if (indice === 0) return `${Math.round(valor)} ${unidad}`

  const texto = valor.toFixed(1).replace('.', ',')
  return texto.endsWith(',0') ? `${texto.slice(0, -2)} ${unidad}` : `${texto} ${unidad}`
}