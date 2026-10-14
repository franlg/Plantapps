/**
 * SELECCIÓN DE FOTOS
 * ===================
 * En un PWA no hay un selector de archivos fiable que sea a la vez cámara y
 * galería, así que usamos el truco estándar: crear un `<input type="file">`
 * oculto, lanzar `.click()` y esperar a que el usuario elija algo. Con
 * `capture="environment"` Android abre directamente la aplicación de cámara.
 */

/** Origen de la foto. */
export type FuenteFoto = 'camara' | 'galeria'

/**
 * Tiempo de seguridad (ms). En navegadores antiguos cancelar la cámara no
 * dispara ningún evento; con este límite la interfaz nunca se queda colgada.
 */
export const TIMEOUT_PICK_MS = 120_000

export interface OpcionesPickPhoto {
  /** Tiempo máximo de espera en ms. Por defecto 120000 (2 minutos). */
  timeoutMs?: number
}

/**
 * Abre la cámara o la galería del móvil y devuelve el archivo elegido.
 * Resuelve `null` si el usuario cancela, si no devuelve nada o si tarda demasiado.
 * El `<input>` se elimina siempre del DOM.
 */
export async function pickPhoto(
  fuente: FuenteFoto,
  opciones: OpcionesPickPhoto = {},
): Promise<File | null> {
  if (typeof document === 'undefined') {
    throw new Error('Las fotos solo se pueden seleccionar en el navegador.')
  }

  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_PICK_MS
  const input = crearInput(fuente)
  document.body.appendChild(input)
  try {
    return await esperarArchivo(input, timeoutMs)
  } finally {
    // pase lo que pase (incluido un error), el input no se queda huérfano.
    input.remove()
  }
}

/** Convierte un Blob en base64 sin el prefijo `data:` (formato de `BackupFile`). */
export async function blobABase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return bytesABase64(bytes)
}

/** Bytes a base64 en trozos: `String.fromCharCode(...bytes)` revienta con fotos grandes. */
export function bytesABase64(bytes: Uint8Array): string {
  const TROZO = 0x8000
  let binario = ''
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO))
  }
  return btoa(binario)
}

/** Convierte base64 en un Blob. Acepta tanto base64 pelado como una data URL. */
export async function base64ABlob(base64: string, mime: string): Promise<Blob> {
  const limpio = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const binario = atob(limpio)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function crearInput(fuente: FuenteFoto): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  // `capture="environment"` es lo que hace que el móvil abra la cámara trasera.
  if (fuente === 'camara') input.setAttribute('capture', 'environment')
  input.setAttribute('aria-hidden', 'true')
  input.tabIndex = -1
  // Oculto pero fuera de pantalla: con `display: none` algunos navegadores no
  // abren el diálogo de archivos.
  input.style.position = 'fixed'
  input.style.top = '0'
  input.style.left = '-9999px'
  input.style.width = '1px'
  input.style.height = '1px'
  input.style.opacity = '0'
  return input
}

function esperarArchivo(input: HTMLInputElement, timeoutMs: number): Promise<File | null> {
  return new Promise<File | null>((resolve) => {
    let resuelto = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finalizar = (archivo: File | null) => {
      if (resuelto) return
      resuelto = true
      if (timer !== undefined) clearTimeout(timer)
      input.removeEventListener('change', alCambiar)
      input.removeEventListener('cancel', alCancelar)
      resolve(archivo)
    }

    const alCambiar = () => finalizar(input.files?.[0] ?? null)
    const alCancelar = () => finalizar(null)

    input.addEventListener('change', alCambiar)
    input.addEventListener('cancel', alCancelar)

    timer = setTimeout(() => finalizar(null), Math.max(0, timeoutMs))

    try {
      input.click()
    } catch {
      finalizar(null)
    }
  })
}