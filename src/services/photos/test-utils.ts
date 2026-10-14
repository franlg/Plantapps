/**
 * Utilidades SOLO para tests (jsdom no trae canvas real ni decodifica imágenes).
 * No las importa el código de la app.
 */
import { vi } from 'vitest'

export interface ConfigEntorno {
  /** Anchura de la imagen simulada. */
  ancho: number
  /** Altura de la imagen simulada. */
  alto: number
  /** Alfa (0-255) del píxel muestreado. 255 = opaco. */
  alfa?: number
  /** No existe `createImageBitmap`: se usa `<img>` + objectURL. */
  sinBitmap?: boolean
  /** `createImageBitmap` existe pero falla: se cae a `<img>`. */
  bitmapConError?: boolean
  /** El `<img>` dispara `onerror`: imagen no descodificable. */
  imagenConError?: boolean
  /** `toBlob` devuelve null para ese tipo: fuerza la degradación a JPEG. */
  fallarCon?: string
  /** El contexto 2D declara que no soporta el canal alfa. */
  sinAlfa?: boolean
}

export interface EntornoFalso {
  /** Llamadas a `drawImage` con el tamaño pedido y si había fondo blanco previo. */
  dibujos: Array<{ width: number; height: number; fondoPrevio: boolean }>
  /** Llamadas a `toBlob` con el tipo y la calidad pedidos. */
  exportaciones: Array<{ tipo: string | undefined; calidad: number | undefined }>
  /** Veces que se ha cerrado el `ImageBitmap`. */
  cierresDeBitmap: () => number
  /** ObjectURLs revocados (releak del camino `<img>`). */
  objectUrlsRevocadas: string[]
  /** Restaura spies y globals. Llamar en `afterEach`. */
  restaurar: () => void
}

/** Sustituye canvas, `createImageBitmap`, `Image` y `revokeObjectURL` por dobles. */
export function instalarEntornoImagen(config: ConfigEntorno): EntornoFalso {
  const {
    ancho,
    alto,
    alfa = 255,
    sinBitmap = false,
    bitmapConError = false,
    imagenConError = false,
    fallarCon,
    sinAlfa = false,
  } = config

  const dibujos: EntornoFalso['dibujos'] = []
  const exportaciones: EntornoFalso['exportaciones'] = []
  const objectUrlsRevocadas: string[] = []
  let cierres = 0
  let fondoPrevio = false

  const contexto = {
    fillStyle: '',
    imageSmoothingQuality: 'low',
    fillRect: () => {
      fondoPrevio = true
    },
    drawImage: (_fuente: unknown, _x: number, _y: number, width: number, height: number) => {
      dibujos.push({ width, height, fondoPrevio })
      fondoPrevio = false
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray([10, 20, 30, alfa]),
      width: w,
      height: h,
    }),
  }
  if (sinAlfa) {
    Object.assign(contexto, { getContextAttributes: () => ({ alpha: false }) })
  }

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => contexto) as unknown as HTMLCanvasElement['getContext'],
  )

  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    ((callback: BlobCallback, type?: string, quality?: unknown) => {
      exportaciones.push({ tipo: type, calidad: typeof quality === 'number' ? quality : undefined })
      if (fallarCon && type === fallarCon) {
        callback(null)
        return
      }
      callback(new Blob([new Uint8Array(128)], { type: type ?? 'image/png' }))
    }) as unknown as HTMLCanvasElement['toBlob'],
  )

  if (sinBitmap) {
    vi.stubGlobal('createImageBitmap', undefined)
  } else if (bitmapConError) {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('sin soporte'))))
  } else {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: ancho,
        height: alto,
        close: () => {
          cierres += 1
        },
      })),
    )
  }

  class ImagenFalsa {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = ancho
    naturalHeight = alto
    width = 0
    height = 0
    #origen = ''

    set src(valor: string) {
      this.#origen = valor
      setTimeout(() => {
        if (imagenConError) this.onerror?.()
        else this.onload?.()
      }, 0)
    }

    get src(): string {
      return this.#origen
    }
  }
  vi.stubGlobal('Image', ImagenFalsa)

  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string | URL) => {
    objectUrlsRevocadas.push(String(url))
  })

  return {
    dibujos,
    exportaciones,
    cierresDeBitmap: () => cierres,
    objectUrlsRevocadas,
    restaurar: () => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    },
  }
}

/** Blob de prueba con contenido real (para las pruebas de base64). */
export function blobDePrueba(tipo = 'application/octet-stream', tamaño = 256): Blob {
  const bytes = new Uint8Array(tamaño)
  for (let i = 0; i < tamaño; i += 1) bytes[i] = (i * 7 + 13) % 256
  return new Blob([bytes], { type: tipo })
}