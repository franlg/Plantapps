import type { ID } from './plant'

/**
 * Una foto almacenada localmente en el dispositivo.
 * `blob` es la imagen completa ya comprimida; `thumb` una versión pequeña para listas.
 */
export interface StoredPhoto {
  id: ID
  blob: Blob
  thumb: Blob
  mime: string
  width: number
  height: number
  /** Tamaño en bytes del blob completo. */
  bytes: number
  /** ISO datetime. */
  creadoEn: string
}