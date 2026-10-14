/**
 * COMPRESIÓN DE FOTOS
 * ===================
 * Las fotos del móvil pesan entre 3 y 8 MB: demasiado para guardarlas en
 * IndexedDB y para mandarlas a un modelo de IA. Aquí reducimos cada imagen a:
 *
 *  - una versión principal (1280 px de lado mayor, JPEG q=0.82) para ver y analizar;
 *  - una miniatura (320 px, JPEG q=0.7) para listas y cuadrículas.
 *
 * Todo el cálculo de tamaños vive en `calcularDimensiones`, una función pura y
 * testeable; el resto solo mueve píxeles y libera recursos.
 */

/** Formato de salida por defecto. */
export const MIME_JPEG = 'image/jpeg'
/** Único formato con transparencia que respetamos (photos recortadas de la galería). */
export const MIME_PNG = 'image/png'

/** Lado mayor (px) de la imagen principal. */
export const MAX_LADO_POR_DEFECTO = 1280
/** Calidad JPEG de la imagen principal. */
export const CALIDAD_POR_DEFECTO = 0.82
/** Lado mayor (px) de la miniatura. */
export const MAX_LADO_THUMB = 320
/** Calidad JPEG de la miniatura. */
export const CALIDAD_THUMB = 0.7

export interface OpcionesCompresion {
  /** Lado mayor máximo en píxeles. Por defecto 1280. */
  maxLado?: number
  /** Calidad JPEG (0-1) de la imagen principal. Por defecto 0.82. */
  calidad?: number
}

export interface ResultadoCompresion {
  /** Imagen principal comprimida (o la original si ya era pequeña). */
  blob: Blob
  /** Miniatura para listas. */
  thumb: Blob
  /** Ancho en px del blob principal. */
  width: number
  /** Alto en px del blob principal. */
  height: number
}

export const ERROR_IMAGEN_VACIA = 'El archivo de imagen está vacío.'
export const ERROR_IMAGEN_NO_LEIBLE =
  'No se ha podido abrir la imagen. Puede que el archivo esté dañado o tenga un formato no compatible.'
export const ERROR_SIN_CANVAS = 'Este navegador no permite procesar imágenes (no hay soporte de canvas 2D).'
export const ERROR_EXPORTACION = 'No se ha podido guardar la imagen comprimida.'

/**
 * Calcula el tamaño respetando la relación de aspecto.
 *
 * Reglas: nunca amplía (si la imagen ya cabe, devuelve su tamaño original),
 * el lado mayor nunca pasa de `maxLado` y ningún lado baja de 1 px. Devuelve
 * enteros redondeados.
 */
export function calcularDimensiones(
  width: number,
  height: number,
  maxLado: number,
): { width: number; height: number } {
  const limite = enteroPositivo(maxLado, 1)
  const ancho = enteroPositivo(width, 1)
  const alto = enteroPositivo(height, 1)

  const ladoMayor = Math.max(ancho, alto)
  if (ladoMayor <= limite) return { width: ancho, height: alto }

  const factor = limite / ladoMayor
  return {
    width: Math.max(1, Math.round(ancho * factor)),
    height: Math.max(1, Math.round(alto * factor)),
  }
}

/**
 * Decide el formato de salida. Solo se conserva el PNG cuando la entrada es un
 * PNG que además tiene píxeles transparentes y el canvas soporta el canal alfa;
 * en cualquier otro caso (o si el canvas no puede con alfa) degrada a JPEG.
 */
export function elegirMime(tipoEntrada: string, tieneAlfa: boolean, soportaAlfa: boolean): string {
  return tipoEntrada === MIME_PNG && tieneAlfa && soportaAlfa ? MIME_PNG : MIME_JPEG
}

/**
 * Comprime una imagen.
 *
 * Siempre devuelve la miniatura. La imagen principal solo se recomprime cuando
 * supera `maxLado`; si ya es pequeña se devuelve el blob original tal cual para
 * no degradar la imagen sin necesidad.
 */
export async function comprimirImagen(
  entrada: File | Blob,
  opciones: OpcionesCompresion = {},
): Promise<ResultadoCompresion> {
  if (!entrada || typeof entrada.size !== 'number') throw new Error(ERROR_IMAGEN_NO_LEIBLE)
  if (entrada.size === 0) throw new Error(ERROR_IMAGEN_VACIA)

  const maxLado = enteroPositivo(opciones.maxLado, MAX_LADO_POR_DEFECTO)
  const calidad = limitarCalidad(opciones.calidad, CALIDAD_POR_DEFECTO)

  const imagen = await decodificar(entrada)
  try {
    const original = { width: imagen.width, height: imagen.height }
    const objetivo = calcularDimensiones(original.width, original.height, maxLado)
    const reduce = Math.max(original.width, original.height) > maxLado
    const mime = detectarMime(entrada.type, imagen)

    const principal = reduce ? await renderizar(imagen, objetivo, mime, calidad) : entrada
    const thumb = await renderizar(
      imagen,
      calcularDimensiones(original.width, original.height, MAX_LADO_THUMB),
      mime,
      CALIDAD_THUMB,
    )

    const dimensiones = reduce ? objetivo : original
    return { blob: principal, thumb, width: dimensiones.width, height: dimensiones.height }
  } finally {
    imagen.liberar()
  }
}

/** Imagen ya decodificada (un `ImageBitmap` o un `<img>`) que sabe liberarse. */
interface ImagenDecodificada {
  width: number
  height: number
  /** Pinta la imagen completa en el lienzo, escalada a `width` x `height`. */
  dibujar(ctx: CanvasRenderingContext2D, width: number, height: number): void
  /** Libera la memoria. Se llama siempre, incluso si algo falla. */
  liberar(): void
}

/** Decodifica con `createImageBitmap` si existe; si no, con `Image` + objectURL. */
async function decodificar(blob: Blob): Promise<ImagenDecodificada> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      return {
        width: bitmap.width,
        height: bitmap.height,
        dibujar: (ctx, width, height) => {
          ctx.drawImage(bitmap, 0, 0, width, height)
        },
        liberar: () => bitmap.close(),
      }
    } catch {
      // Navegadores antiguos o formatos no soportados: seguimos con <img>.
    }
  }

  return decodificarConImage(blob)
}

function decodificarConImage(blob: Blob): Promise<ImagenDecodificada> {
  return new Promise<ImagenDecodificada>((resolve, reject) => {
    let objectUrl: string
    try {
      objectUrl = URL.createObjectURL(blob)
    } catch {
      reject(new Error(ERROR_IMAGEN_NO_LEIBLE))
      return
    }
    const url = objectUrl

    const img = new Image()
    img.onload = () => {
      const width = img.naturalWidth || img.width
      const height = img.naturalHeight || img.height
      if (!width || !height) {
        URL.revokeObjectURL(url)
        reject(new Error(ERROR_IMAGEN_NO_LEIBLE))
        return
      }
      resolve({
        width,
        height,
        dibujar: (ctx, w, h) => {
          ctx.drawImage(img, 0, 0, w, h)
        },
        liberar: () => {
          img.onload = null
          img.onerror = null
          URL.revokeObjectURL(url)
        },
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(ERROR_IMAGEN_NO_LEIBLE))
    }
    img.src = url
  })
}

/**
 * Mira un píxel de la imagen para saber si tiene transparencia y si el canvas
 * admite el canal alfa. Solo se ejecuta con entradas PNG.
 */
function detectarMime(tipoEntrada: string, imagen: ImagenDecodificada): string {
  // Solo el PNG puede perder información al convertirlo a JPEG: el resto va directo.
  if (tipoEntrada !== MIME_PNG) return MIME_JPEG

  const ctx = contexto2d(crearLienzo(1, 1))
  if (!ctx) return elegirMime(tipoEntrada, false, false)

  let soportaAlfa = true
  try {
    if (typeof ctx.getContextAttributes === 'function') {
      const atributos = ctx.getContextAttributes()
      if (atributos && atributos.alpha === false) soportaAlfa = false
    }
  } catch {
    soportaAlfa = false
  }

  let tieneAlfa = false
  if (soportaAlfa) {
    try {
      imagen.dibujar(ctx, 1, 1)
      tieneAlfa = ctx.getImageData(0, 0, 1, 1).data[3] < 255
    } catch {
      tieneAlfa = false
    }
  }

  return elegirMime(tipoEntrada, tieneAlfa, soportaAlfa)
}

async function renderizar(
  imagen: ImagenDecodificada,
  dimensiones: { width: number; height: number },
  mime: string,
  calidad: number,
): Promise<Blob> {
  const canvas = crearLienzo(dimensiones.width, dimensiones.height)
  const ctx = contexto2d(canvas)
  if (!ctx) throw new Error(ERROR_SIN_CANVAS)

  // JPEG no tiene canal alfa: sin fondo blanco las zonas transparentes salen negras.
  if (mime !== MIME_PNG) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, dimensiones.width, dimensiones.height)
  }
  ctx.imageSmoothingQuality = 'high'
  imagen.dibujar(ctx, dimensiones.width, dimensiones.height)

  return await lienzoABlob(canvas, mime, calidad)
}

/** Exporta el lienzo; si el formato pedido no sale, degrada a JPEG antes de fallar. */
async function lienzoABlob(canvas: HTMLCanvasElement, mime: string, calidad: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((resultado) => resolve(resultado), mime, calidad)
    } catch {
      resolve(null)
    }
  })

  if (blob) return blob
  if (mime !== MIME_JPEG) return await lienzoABlob(canvas, MIME_JPEG, calidad)
  throw new Error(ERROR_EXPORTACION)
}

function crearLienzo(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function contexto2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d')
  } catch {
    return null
  }
}

/** Entero >= 1 (o `porDefecto` si no se pasó valor o no es un número válido). */
function enteroPositivo(valor: number | undefined, porDefecto: number): number {
  if (valor === undefined || !Number.isFinite(valor)) return porDefecto
  return Math.max(1, Math.round(valor))
}

function limitarCalidad(valor: number | undefined, porDefecto: number): number {
  if (valor === undefined || !Number.isFinite(valor)) return porDefecto
  return Math.min(1, Math.max(0.01, valor))
}