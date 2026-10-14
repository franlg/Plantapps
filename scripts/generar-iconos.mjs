#!/usr/bin/env node
/**
 * GENERADOR DE ICONOS
 * ====================
 * Dibuja los iconos PNG de la PWA **sin ninguna dependencia**: escribimos los
 * chunks del PNG a mano y comprimimos con `node:zlib`. Nada de sharp, nada de
 * ImageMagick: el proyecto solo necesita Node.
 *
 * Para re-generarlos:
 *     node scripts/generar-iconos.mjs
 *
 * Cómo funciona el dibujo:
 *  1. Se pinta a 3x de resolución (1536x1536 para el icono de 512) y luego se
 *     reduce con media de caja: eso da el antialiasing sin implementar nada.
 *  2. Las formas son polígonos planos que se rellenan por líneas de barrido.
 *  3. Cada píxel lo pinta un callback, así que el relleno puede ser un color
 *     plano o un degradado sin cambiar el resto del motor.
 *  4. Los PNG salen en color verdadero RGB (sin canal alfa): todos los iconos
 *     llevan fondo a sangre, y Android pone su propia máscara encima.
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'public', 'icons')

/** Factor de supermuestreo: se dibuja a 3x y se reduce a 1x. */
const ESCALA = 3

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[n] = c >>> 0
  }
  return tabla
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunkPng(tipo, datos) {
  const cabecera = Buffer.alloc(8)
  cabecera.writeUInt32BE(datos.length, 0)
  cabecera.write(tipo, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([cabecera.subarray(4, 8), datos])), 0)
  return Buffer.concat([cabecera, datos, crc])
}

/** Predicción Paeth (la misma que usa el PNG de referencia). */
function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/**
 * Aplica a cada línea de píxeles el filtro PNG que menos bytes "absurdos"
 * genera (heurística estándar de libpng). Un PNG bien filtrado baja bastante
 * de tamaño y, de paso, el service worker lo cachea más rápido.
 */
function comprimirLineas(anchoTotal, altoTotal, data) {
  const bytes = 3 // color verdadero RGB, 8 bits por canal
  const ancho = anchoTotal * bytes
  const bruto = Buffer.alloc(altoTotal * (ancho + 1))
  const anterior = Buffer.alloc(ancho)
  const candidatos = [Buffer.alloc(ancho), Buffer.alloc(ancho), Buffer.alloc(ancho), Buffer.alloc(ancho), Buffer.alloc(ancho)]

  for (let y = 0; y < altoTotal; y += 1) {
    const fila = data.subarray(y * ancho, y * ancho + ancho)
    let mejor = 0
    let mejorPuntuacion = Infinity

    for (let i = 0; i < ancho; i += 1) {
      const x = fila[i]
      const izquierda = i >= bytes ? fila[i - bytes] : 0
      const arriba = y > 0 ? anterior[i] : 0
      const arribaIzq = y > 0 && i >= bytes ? anterior[i - bytes] : 0
      candidatos[0][i] = x
      candidatos[1][i] = (x - izquierda) & 0xff
      candidatos[2][i] = (x - arriba) & 0xff
      candidatos[3][i] = (x - ((izquierda + arriba) >> 1)) & 0xff
      candidatos[4][i] = (x - paeth(izquierda, arriba, arribaIzq)) & 0xff
    }

    for (let f = 0; f < 5; f += 1) {
      let suma = 0
      for (let i = 0; i < ancho; i += 1) {
        const v = candidatos[f][i]
        suma += v < 128 ? v : 256 - v
      }
      if (suma < mejorPuntuacion) {
        mejorPuntuacion = suma
        mejor = f
      }
    }

    const destino = y * (ancho + 1)
    bruto[destino] = mejor
    candidatos[mejor].copy(bruto, destino + 1)
    anterior.set(fila)
  }

  return bruto
}

function codificarPng(lienzo) {
  const { width, height, data } = lienzo
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // profundidad de bits
  ihdr[9] = 2 // color verdadero (RGB, sin alfa)
  ihdr[10] = 0 // compresión deflate
  ihdr[11] = 0 // filtro adaptativo
  ihdr[12] = 0 // sin entrelazado

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPng('IHDR', ihdr),
    chunkPng('IDAT', deflateSync(comprimirLineas(width, height, data), { level: 9 })),
    chunkPng('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// Lienzo
// ---------------------------------------------------------------------------

/** Convierte "#rrggbb" en [r, g, b, alfa] con alfa de 0 a 255. */
function color(hex, alfa = 1) {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, Math.round(Math.max(0, Math.min(1, alfa)) * 255)]
}

class Lienzo {
  constructor(width, height) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 3)
  }

  /** Mezcla el color `rgba` sobre el píxel (x, y) con el alfa dado. */
  mezclar(x, y, rgba) {
    const alfa = rgba[3]
    if (alfa <= 0) return
    const i = (y * this.width + x) * 3
    const d = this.data
    if (alfa >= 255) {
      d[i] = rgba[0]
      d[i + 1] = rgba[1]
      d[i + 2] = rgba[2]
      return
    }
    d[i] += ((rgba[0] - d[i]) * alfa) / 255
    d[i + 1] += ((rgba[1] - d[i + 1]) * alfa) / 255
    d[i + 2] += ((rgba[2] - d[i + 2]) * alfa) / 255
  }

  /**
   * Rellena un polígono cerrado con la regla par-impar, recorriendo filas.
   * `pintor(x, y)` devuelve [r, g, b, alfa] y se evalúa en el centro del píxel,
   * así puede devolver un color plano o un degradado sin coste extra.
   */
  rellenar(puntos, pintor) {
    const total = puntos.length
    if (total < 3) return
    let yMin = Infinity
    let yMax = -Infinity
    for (let i = 0; i < total; i += 1) {
      const y = puntos[i][1]
      if (y < yMin) yMin = y
      if (y > yMax) yMax = y
    }
    const filas = Math.max(0, Math.min(this.height - 1, Math.ceil(yMax)))
    const primera = Math.max(0, Math.floor(yMin))
    const cruces = new Float64Array(total)

    for (let y = primera; y <= filas; y += 1) {
      const sy = y + 0.5
      let n = 0
      for (let i = 0; i < total; i += 1) {
        const a = puntos[i]
        const b = puntos[(i + 1) % total]
        if (a[1] <= sy === b[1] <= sy) continue
        const t = (sy - a[1]) / (b[1] - a[1])
        cruces[n] = a[0] + t * (b[0] - a[0])
        n += 1
      }
      if (n < 2) continue
      // Orden de inserción: `n` es diminuto (como mucho 2 por vértice).
      for (let i = 1; i < n; i += 1) {
        const v = cruces[i]
        let j = i - 1
        while (j >= 0 && cruces[j] > v) {
          cruces[j + 1] = cruces[j]
          j -= 1
        }
        cruces[j + 1] = v
      }
      for (let i = 0; i + 1 < n; i += 2) {
        const desde = Math.max(0, Math.ceil(cruces[i] - 0.5))
        const hasta = Math.min(this.width - 1, Math.ceil(cruces[i + 1] - 0.5) - 1)
        for (let x = desde; x <= hasta; x += 1) this.mezclar(x, y, pintor(x + 0.5, sy))
      }
    }
  }

  /** Media de caja: baja la resolución del lienzo (es el antialiasing). */
  reducir(factor) {
    const ancho = Math.round(this.width / factor)
    const alto = Math.round(this.height / factor)
    const salida = new Lienzo(ancho, alto)
    const n = factor * factor
    for (let y = 0; y < alto; y += 1) {
      for (let x = 0; x < ancho; x += 1) {
        let r = 0
        let g = 0
        let b = 0
        for (let dy = 0; dy < factor; dy += 1) {
          const fila = ((y * factor + dy) * this.width + x * factor) * 3
          for (let dx = 0; dx < factor; dx += 1) {
            r += this.data[fila + dx * 3]
            g += this.data[fila + dx * 3 + 1]
            b += this.data[fila + dx * 3 + 2]
          }
        }
        const i = (y * ancho + x) * 3
        salida.data[i] = r / n
        salida.data[i + 1] = g / n
        salida.data[i + 2] = b / n
      }
    }
    return salida
  }
}

// ---------------------------------------------------------------------------
// Pintores (color plano o degradado)
// ---------------------------------------------------------------------------

const plano = (rgb) => () => rgb

/** Degradado lineal proyectado sobre el vector (x0,y0) -> (x1,y1). */
function degradado(x0, y0, x1, y1, desde, hasta) {
  const dx = x1 - x0
  const dy = y1 - y0
  const largo = dx * dx + dy * dy || 1
  return (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / largo))
    const a = desde[3] + (hasta[3] - desde[3]) * t
    return [
      desde[0] + (hasta[0] - desde[0]) * t,
      desde[1] + (hasta[1] - desde[1]) * t,
      desde[2] + (hasta[2] - desde[2]) * t,
      a,
    ]
  }
}

/** Halo suave: degradado radial con alfa que cae a cero. */
function halo(cx, cy, radio, tono, fuerza) {
  return (x, y) => {
    const d = Math.min(1, Math.hypot(x - cx, y - cy) / radio)
    const caida = (1 - d) * (1 - d)
    return [tono[0], tono[1], tono[2], Math.round(tono[3] * fuerza * caida)]
  }
}

// ---------------------------------------------------------------------------
// Geometría (unidades 0..1, la transforman al tamaño del lienzo)
// ---------------------------------------------------------------------------

function bezier3(p0, p1, p2, p3, pasos = 32) {
  const puntos = []
  for (let i = 0; i <= pasos; i += 1) {
    const t = i / pasos
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const d = t * t * t
    puntos.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ])
  }
  return puntos
}

function bezier2(p0, p1, p2, pasos = 32) {
  const puntos = []
  for (let i = 0; i <= pasos; i += 1) {
    const t = i / pasos
    const u = 1 - t
    puntos.push([u * u * p0[0] + 2 * t * u * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * t * u * p1[1] + t * t * p2[1]])
  }
  return puntos
}

/**
 * Hoja lanceolada: dos curvas cuadráticas, una por cada lado del eje.
 * En una cuadrática `bezier(base, control, punta)` el punto medio cae a la
 * mitad del desplazamiento del control, así que `ancho` es la anchura real
 * de la hoja en su parte más ancha (y las puntas quedan afiladas).
 */
function hoja(base, punta, ancho) {
  const [mx, my] = [(base[0] + punta[0]) / 2, (base[1] + punta[1]) / 2]
  const dx = punta[0] - base[0]
  const dy = punta[1] - base[1]
  const largo = Math.hypot(dx, dy) || 1
  const px = -dy / largo
  const py = dx / largo
  return [
    ...bezier2(base, [mx + px * ancho, my + py * ancho], punta, 40),
    ...bezier2(punta, [mx - px * ancho, my - py * ancho], base, 40),
  ]
}

/** Mitad de la anchura de la hoja en el parámetro `t` de su curva. */
function medioAncho(t, ancho) {
  return 2 * t * (1 - t) * ancho
}

/** Inserta puntos intermedios para que ningún tramo pase de `paso` píxeles. */
function densificar(puntos, paso) {
  const salida = [puntos[0]]
  for (let i = 1; i < puntos.length; i += 1) {
    const [x0, y0] = puntos[i - 1]
    const [x1, y1] = puntos[i]
    const largo = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.ceil(largo / paso))
    for (let k = 1; k <= n; k += 1) salida.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n])
  }
  return salida
}

/** Nervadura central (el propio eje de la hoja) y laterales en abanico. */
function venas(base, punta, ancho) {
  const dx = punta[0] - base[0]
  const dy = punta[1] - base[1]
  const largo = Math.hypot(dx, dy) || 1
  const px = -dy / largo
  const py = dx / largo
  const punto = (t) => [base[0] + dx * t, base[1] + dy * t]
  const central = [punto(0.04), punto(0.5), punto(0.96)]
  const trazos = [central]
  for (const lado of [1, -1]) {
    for (const [t, dt] of [
      [0.22, 0.22],
      [0.46, 0.2],
    ]) {
      const borde = medioAncho(t + dt, ancho) * 0.68
      const desde = punto(t)
      const hasta = [punto(t + dt)[0] + px * borde * lado, punto(t + dt)[1] + py * borde * lado]
      const control = [punto(t + dt * 0.55)[0] + px * borde * 0.25 * lado, punto(t + dt * 0.55)[1] + py * borde * 0.25 * lado]
      trazos.push([desde, control, hasta])
    }
  }
  return trazos
}

function circulo(cx, cy, r, pasos = 64) {
  const puntos = []
  for (let i = 0; i < pasos; i += 1) {
    const a = (i / pasos) * Math.PI * 2
    puntos.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return puntos
}

function rectanguloRedondeado(x0, y0, x1, y1, r, pasos = 8) {
  const puntos = []
  const esquina = (cx, cy, desde) => {
    for (let i = 0; i <= pasos; i += 1) {
      const a = desde + (i / pasos) * (Math.PI / 2)
      puntos.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
  }
  esquina(x1 - r, y0 + r, -Math.PI / 2)
  esquina(x1 - r, y1 - r, 0)
  esquina(x0 + r, y1 - r, Math.PI / 2)
  esquina(x0 + r, y0 + r, Math.PI)
  return puntos
}

/** Escala los puntos del espacio unidad (0..1) al lienzo, centrado. */
function transformar(puntos, escala, ancho, alto) {
  const cx = ancho / 2
  const cy = alto / 2
  return puntos.map(([x, y]) => [cx + (x - 0.5) * escala, cy + (y - 0.5) * escala])
}

// ---------------------------------------------------------------------------
// El dibujo: una maceta con dos hojas
// ---------------------------------------------------------------------------

function elipse(cx, cy, rx, ry, pasos = 80) {
  const puntos = []
  for (let i = 0; i < pasos; i += 1) {
    const a = (i / pasos) * Math.PI * 2
    puntos.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return puntos
}

/**
 * @param {Lienzo} lienzo lienzo de trabajo (ya a ESCALA x)
 * @param {number} escala lado del contenido dentro del lienzo, en píxeles
 */
function dibujarPlanta(lienzo, escala) {
  const W = lienzo.width
  const H = lienzo.height
  const cx = W / 2
  const cy = H / 2

  /** Unidad (0..1) -> píxeles del lienzo. */
  const px = (x, y) => [cx + (x - 0.5) * escala, cy + (y - 0.5) * escala]
  const dibujar = (puntos, pintor) => lienzo.rellenar(transformar(puntos, escala, W, H), pintor)
  /** Degradado definido en unidades y proyectado ya en píxeles. */
  const grad = (x0, y0, x1, y1, desde, hasta) => {
    const a = px(x0, y0)
    const b = px(x1, y1)
    return degradado(a[0], a[1], b[0], b[1], desde, hasta)
  }
  // Un trazo es una tira de discos: opacos, así los empalmes no se notan.
  // Los discos van tan juntos que se solapan y sale una línea continua.
  const puntosDeTrazo = (trazo) => {
    if (trazo.length === 2) return trazo
    if (trazo.length === 3) return bezier2(trazo[0], trazo[1], trazo[2], 24)
    return bezier3(trazo[0], trazo[1], trazo[2], trazo[3], 24)
  }
  const dibujarLinea = (trazos, grosor, pintor) => {
    const r = (grosor * escala) / 2
    for (const trazo of trazos) {
      const ps = transformar(densificar(puntosDeTrazo(trazo), grosor * 0.2), escala, W, H)
      for (const p of ps) lienzo.rellenar(circulo(p[0], p[1], r, 24), pintor)
    }
  }

  // 1. Fondo: degradado verde en diagonal, con un halo suave arriba a la izquierda.
  const todoElLienzo = [
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ]
  lienzo.rellenar(todoElLienzo, degradado(0, 0, W, H, color('#4f9e63'), color('#16301f')))
  lienzo.rellenar(todoElLienzo, halo(W * 0.28, H * 0.2, W * 0.85, color('#bfe9cb'), 0.5))

  // 2. Maceta: cuerpo troncocónico + borde, en terracota.
  dibujar(
    [
      [0.262, 0.755],
      [0.738, 0.755],
      [0.648, 0.93],
      [0.61, 0.955],
      [0.39, 0.955],
      [0.352, 0.93],
    ],
    grad(0.5, 0.755, 0.5, 0.955, color('#cf9860'), color('#8a5a31')),
  )
  dibujar(rectanguloRedondeado(0.228, 0.7, 0.772, 0.772, 0.022), grad(0.5, 0.7, 0.5, 0.772, color('#e2ad78'), color('#b9804d')))

  // Tierra dentro del borde.
  dibujar(elipse(0.5, 0.736, 0.243, 0.026), plano(color('#5a4128')))

  // 3. Tallo: curva suave desde la tierra hasta donde nacen las hojas.
  dibujarLinea([[[0.5, 0.74], [0.5, 0.64], [0.485, 0.54], [0.5, 0.44]]], 0.028, plano(color('#2f6b3c')))

  // 4. Hoja grande (a la derecha), con nervadura.
  const baseG = [0.5, 0.5]
  const puntaG = [0.83, 0.135]
  const anchoG = 0.205
  dibujar(hoja(baseG, puntaG, anchoG), grad(baseG[0], baseG[1], puntaG[0], puntaG[1], color('#2f7d44'), color('#a6dcb4')))
  dibujarLinea(venas(baseG, puntaG, anchoG), 0.011, plano(color('#e4f5e8')))

  // 5. Hoja pequeña (a la izquierda), más apagada: da profundidad.
  const baseP = [0.5, 0.56]
  const puntaP = [0.16, 0.3]
  const anchoP = 0.145
  dibujar(hoja(baseP, puntaP, anchoP), grad(baseP[0], baseP[1], puntaP[0], puntaP[1], color('#256039'), color('#69b57d')))
  dibujarLinea(venas(baseP, puntaP, anchoP), 0.009, plano(color('#cdebd5')))
}

/** Genera un icono: dibuja en grande, reduce y codifica. */
function icono(tamano, escalaContenido) {
  const lienzo = new Lienzo(tamano * ESCALA, tamano * ESCALA)
  dibujarPlanta(lienzo, tamano * ESCALA * escalaContenido)
  return codificarPng(lienzo.reducir(ESCALA))
}

const ficheros = [
  // Los iconos "any" van casi a sangre; el maskable deja el 22% de margen para
  // que la hoja siga dentro del círculo seguro cuando Android la recorta.
  ['icon-192.png', icono(192, 0.94)],
  ['icon-512.png', icono(512, 0.94)],
  ['icon-maskable-512.png', icono(512, 0.72)],
  ['favicon.png', icono(32, 0.98)],
]

mkdirSync(DESTINO, { recursive: true })
for (const [nombre, buffer] of ficheros) {
  writeFileSync(join(DESTINO, nombre), buffer)
  console.log(`  ${nombre.padEnd(24)} ${(buffer.length / 1024).toFixed(1)} kB`)
}
console.log(`Iconos generados en public/icons/`)