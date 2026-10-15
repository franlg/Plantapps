import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * TEST DEL SERVICE WORKER
 * ======================
 * `public/sw.js` es JavaScript a pelo (Vite lo copia tal cual a `dist/`), así que
 * ningún import de TypeScript lo puede cubrir. Aquí se lee el fichero tal cual y
 * se ejecuta dentro de un `self` falso, con IndexedDB de verdad
 * (`fake-indexeddb`): si la parte de avisos se rompe, se rompe aquí.
 *
 * De paso se comprueba que la lógica de caché que ya funcionaba sigue igual.
 */

/**
 * Los módulos de Node se piden con el nombre en una variable (como ya hace
 * `db/dexie.test.ts`): así Vite no intenta resolverlos y TypeScript no necesita
 * los tipos de Node, que la app no usa.
 */
const moduloFs = 'node:fs'
const moduloProceso = 'node:process'
const { readFileSync } = (await import(/* @vite-ignore */ moduloFs)) as {
  readFileSync: (ruta: string, codificacion: string) => string
}
const { cwd } = (await import(/* @vite-ignore */ moduloProceso)) as { cwd: () => string }

/**
 * El fichero se busca desde la raíz del proyecto: en jsdom `import.meta.url` es
 * una URL `http://`, no de disco, y `public/` no se puede importar (Vite lo
 * sirve tal cual).
 */
const CODIGO = readFileSync(`${cwd()}/public/sw.js`, 'utf8')

/** Nombre de la base de datos de avisos que usa el service worker (ver `sw.js`). */
const BD_AVISOS = 'plantapps-avisos'
const ALMACEN_AVISOS = 'pendientes'

interface Aviso {
  id: string
  plantId: string
  titulo: string
  cuerpo: string
  para: string
}

interface NotificacionMostrada {
  titulo: string
  opciones: NotificationOptions
}

interface VentanaFalsa {
  url: string
  focus: () => Promise<void>
}

interface EventoFalso {
  data?: unknown
  ports?: MessagePort[]
  notification?: { close: () => void }
  waitUntil: (promesa: Promise<unknown>) => void
  respondWith: (respuesta: Promise<unknown>) => void
}

type Manejador = (evento: EventoFalso) => void

interface OpcionesArnes {
  permiso?: NotificationPermission
  ventanas?: VentanaFalsa[]
  /** Claves de caché que ya existen al empezar. */
  cachas?: Record<string, string[]>
}

interface Arnes {
  /** Notificaciones del sistema que se han mostrado. */
  mostradas: NotificacionMostrada[]
  /** Ventanas que ha abierto el worker con `clients.openWindow`. */
  abiertas: string[]
  /** Tipos de evento para los que el worker se ha registrado. */
  eventos: string[]
  /** Veces que el worker se ha saltado a sí mismo (`SKIP_WAITING`). */
  saltaWaiting: () => number
  cachas: Map<string, string[]>
  despachar: (tipo: string, evento?: Partial<EventoFalso>) => Promise<void>
  mensaje: (datos: unknown) => Promise<unknown>
}

/** Ejecuta `sw.js` contra un `self` falso y devuelve el banco de pruebas. */
function nuevoArnes(opciones: OpcionesArnes = {}): Arnes {
  const escuchas = new Map<string, Manejador[]>()
  const eventos: string[] = []
  const mostradas: NotificacionMostrada[] = []
  const abiertas: string[] = []
  const cachas = new Map(Object.entries(opciones.cachas ?? {}).map(([k, v]) => [k, [...v]]))
  let saltaWaiting = 0

  const scope = {
    location: new URL('https://franlg.github.io/Plantapps/sw.js'),
    Notification: { permission: opciones.permiso ?? ('granted' as NotificationPermission) },
    registration: {
      showNotification: async (titulo: string, opciones: NotificationOptions) => {
        mostradas.push({ titulo, opciones })
      },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => opciones.ventanas ?? [],
      openWindow: async (url: string) => {
        abiertas.push(url)
        return null
      },
    },
    addEventListener: (tipo: string, manejador: Manejador) => {
      eventos.push(tipo)
      const lista = escuchas.get(tipo) ?? []
      lista.push(manejador)
      escuchas.set(tipo, lista)
    },
    skipWaiting: async () => {
      saltaWaiting += 1
    },
  }

  // El service worker es un script suelto: se construye con `new Function`
  // inyectando `self` y la caché (que en jsdom no existe).
  const cargar = new Function('self', 'console', 'caches', CODIGO) as unknown as (
    ambito: unknown,
    consola: { error: (...args: unknown[]) => void },
    almacen: unknown,
  ) => void
  cargar(
    scope,
    { error: () => {} },
    {
      keys: async () => [...cachas.keys()],
      delete: async (clave: string) => cachas.delete(clave),
    },
  )

  const despachar = async (tipo: string, evento: Partial<EventoFalso> = {}): Promise<void> => {
    const esperas: Promise<unknown>[] = []
    const completo: EventoFalso = { waitUntil: (p) => esperas.push(p), respondWith: () => {}, ...evento }
    for (const manejador of escuchas.get(tipo) ?? []) manejador(completo)
    await Promise.all(esperas)
  }

  const mensaje = async (datos: unknown): Promise<unknown> => {
    const canal = new MessageChannel()
    const respuesta = new Promise((resolve) => {
      canal.port1.onmessage = (evento: MessageEvent) => resolve(evento.data)
      canal.port1.start()
    })
    await despachar('message', { data: datos, ports: [canal.port2] })
    // Si el worker no contesta, el test no se queda colgado esperando.
    return Promise.race([respuesta, esperar(2000).then(() => 'sin-respuesta')])
  }

  return { mostradas, abiertas, eventos, saltaWaiting: () => saltaWaiting, cachas, despachar, mensaje }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Espera activa a que se cumpla algo, sin fijar un tiempo a ciegas: vale tanto
 * para mirar un array del arnés como para ir a preguntar a su IndexedDB.
 */
async function esperarHastaQue(condicion: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    if (await condicion()) return
    await esperar(20)
  }
  throw new Error('La condición no se cumplió a tiempo')
}

/** Aviso de ejemplo que suena dentro de `enMs` milisegundos. */
function aviso(id: string, enMs: number): Aviso {
  return {
    id,
    plantId: `planta-${id}`,
    titulo: 'Monstera: toca regar',
    cuerpo: 'Toca regar mañana',
    para: new Date(Date.now() + enMs).toISOString(),
  }
}

/** Lo que el service worker tiene de verdad guardado en su IndexedDB. */
function leerGuardados(): Promise<Aviso[]> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(BD_AVISOS)
    peticion.onerror = () => reject(peticion.error)
    peticion.onsuccess = () => {
      const bd = peticion.result
      if (!bd.objectStoreNames.contains(ALMACEN_AVISOS)) {
        bd.close()
        resolve([])
        return
      }
      const peticion2 = bd.transaction(ALMACEN_AVISOS, 'readonly').objectStore(ALMACEN_AVISOS).getAll()
      peticion2.onerror = () => reject(peticion2.error)
      peticion2.onsuccess = () => {
        bd.close()
        resolve(peticion2.result as Aviso[])
      }
    }
  })
}

/** Cada test parte de una base de datos de avisos vacía. */
async function borrarBaseDeDatos(): Promise<void> {
  await new Promise<void>((resolve) => {
    const peticion = indexedDB.deleteDatabase(BD_AVISOS)
    peticion.onsuccess = () => resolve()
    peticion.onerror = () => resolve()
    peticion.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await borrarBaseDeDatos()
})

describe('sw.js sigue siendo un service worker válido', () => {
  it('se registra en todos los eventos que necesita', () => {
    const arnes = nuevoArnes()

    expect(arnes.eventos.sort()).toEqual(['activate', 'fetch', 'install', 'message', 'notificationclick'])
  })

  it('activate sigue borrando solo las cachés viejas', async () => {
    const arnes = nuevoArnes({
      cachas: { 'plantapps-v0': ['a'], 'plantapps-v1': ['b'], 'otra-cosa': ['c'] },
    })

    await arnes.despachar('activate')

    // La versión vieja y la que no es nuestra se van; la vigente se queda.
    expect([...arnes.cachas.keys()].sort()).toEqual(['otra-cosa', 'plantapps-v1'])
  })

  it('el worker rearmado al reiniciarse recupera los avisos que tenía', async () => {
    const antes = nuevoArnes()
    await antes.mensaje({ type: 'SINCRONIZAR_AVISOS', items: [aviso('a', 60_000)] })
    expect(antes.mostradas).toHaveLength(0)

    // Android mata el proceso del worker: al volver se crea uno nuevo desde cero.
    // La lista le sirve de memoria y `activate` la vuelve a armar.
    const despues = nuevoArnes()
    await despues.despachar('activate')

    expect(despues.mostradas).toHaveLength(0)
    expect(await despues.mensaje({ type: 'PEDIR_ESTADO_AVISOS' })).toEqual({ type: 'ESTADO_AVISOS', programados: 1 })
  })

  it('SKIP_WAITING sigue activando la versión nueva', async () => {
    const arnes = nuevoArnes()

    await arnes.despachar('message', { data: { type: 'SKIP_WAITING' } })

    expect(arnes.saltaWaiting()).toBe(1)
  })

  it('ignora mensajes raros sin romperse', async () => {
    const arnes = nuevoArnes()

    await arnes.despachar('message', { data: undefined })
    await arnes.despachar('message', { data: 'texto' })
    await arnes.despachar('message', { data: { type: 'NO_SOY_DE_NADA' } })
    await arnes.despachar('message')

    expect(arnes.saltaWaiting()).toBe(0)
  })
})

describe('SINCRONIZAR_AVISOS guarda la lista en el propio service worker', () => {
  it('responde cuántos avisos quedan programados', async () => {
    const arnes = nuevoArnes()

    const respuesta = await arnes.mensaje({
      type: 'SINCRONIZAR_AVISOS',
      items: [aviso('a', 60_000), aviso('b', 120_000)],
    })

    expect(respuesta).toEqual({ type: 'ESTADO_AVISOS', programados: 2 })
    expect((await leerGuardados()).map((i) => i.id).sort()).toEqual(['a', 'b'])
  })

  it('deja la lista exactamente como se la mandan (lo que no viene, se va)', async () => {
    const arnes = nuevoArnes()

    await arnes.mensaje({ type: 'SINCRONIZAR_AVISOS', items: [aviso('a', 60_000), aviso('b', 120_000)] })
    await arnes.mensaje({ type: 'SINCRONIZAR_AVISOS', items: [aviso('c', 60_000)] })

    expect((await leerGuardados()).map((i) => i.id)).toEqual(['c'])
  })

  it('descarta los avisos que no sirven, sin dejar que rompan nada', async () => {
    const arnes = nuevoArnes()

    const respuesta = await arnes.mensaje({
      type: 'SINCRONIZAR_AVISOS',
      items: [
        aviso('bueno', 60_000),
        { ...aviso('sin-fecha', 60_000), para: 'no-es-una-fecha' },
        { ...aviso('sin-id', 60_000), id: '' },
        { titulo: 'x', cuerpo: 'y', para: new Date(Date.now() + 1000).toISOString() },
        'no soy un objeto',
      ],
    })

    expect(respuesta).toEqual({ type: 'ESTADO_AVISOS', programados: 1 })
    expect((await leerGuardados()).map((i) => i.id)).toEqual(['bueno'])
  })

  it('PEDIR_ESTADO_AVISOS devuelve la lista guardada sin tocar nada más', async () => {
    const arnes = nuevoArnes()
    await arnes.mensaje({ type: 'SINCRONIZAR_AVISOS', items: [aviso('a', 60_000)] })

    expect(await arnes.mensaje({ type: 'PEDIR_ESTADO_AVISOS' })).toEqual({ type: 'ESTADO_AVISOS', programados: 1 })
  })
})

describe('el permiso manda: sin permiso no hay temporizadores', () => {
  it('guarda la lista pero no programa nada', async () => {
    const arnes = nuevoArnes({ permiso: 'denied' })

    const respuesta = await arnes.mensaje({ type: 'SINCRONIZAR_AVISOS', items: [aviso('a', 50)] })
    await esperar(200)

    expect(respuesta).toEqual({ type: 'ESTADO_AVISOS', programados: 0 })
    expect(arnes.mostradas).toHaveLength(0)
    // La lista se conserva: si el usuario activa los avisos, el siguiente
    // rearme la recoge sin que la app tenga que volver a enviar nada.
    expect((await leerGuardados()).map((i) => i.id)).toEqual(['a'])
  })
})

describe('los avisos suenan', () => {
  it('muestra la notificación del sistema y saca el aviso de la lista', async () => {
    const arnes = nuevoArnes()

    await arnes.mensaje({ type: 'SINCRONIZAR_AVISOS', items: [aviso('a', 60)] })
    await esperarHastaQue(() => arnes.mostradas.length === 1)

    const mostrada = arnes.mostradas[0]
    expect(mostrada?.titulo).toBe('Monstera: toca regar')
    expect(mostrada?.opciones.body).toBe('Toca regar mañana')
    // El tag es el id del aviso: un aviso repetido sustituye al anterior.
    expect(mostrada?.opciones.tag).toBe('a')
    expect(mostrada?.opciones.data).toEqual({ plantId: 'planta-a', avisoId: 'a' })
    expect(mostrada?.opciones.icon).toBe('https://franlg.github.io/Plantapps/icons/icon-192.png')

    // Y sale de la lista, así que no vuelve a sonar en el siguiente rearme.
    await esperarHastaQue(async () => (await leerGuardados()).length === 0)
    expect(await arnes.mensaje({ type: 'PEDIR_ESTADO_AVISOS' })).toEqual({ type: 'ESTADO_AVISOS', programados: 0 })
  })

  it('si el worker se despertó tarde, suelta el aviso atrasado', async () => {
    const arnes = nuevoArnes()

    await arnes.mensaje({
      type: 'SINCRONIZAR_AVISOS',
      // Se quedó dormido una hora: al despertar tiene que avisar igual.
      items: [aviso('a', -60 * 60 * 1000)],
    })

    expect(arnes.mostradas).toHaveLength(1)
    expect(arnes.mostradas[0]?.opciones.tag).toBe('a')
    expect(await leerGuardados()).toEqual([])
  })

  it('tira los avisos de hace días: mejor no avisar que spamear', async () => {
    const arnes = nuevoArnes()

    await arnes.mensaje({
      type: 'SINCRONIZAR_AVISOS',
      items: [aviso('viejo', -3 * 24 * 60 * 60 * 1000)],
    })

    expect(arnes.mostradas).toHaveLength(0)
    expect(await leerGuardados()).toEqual([])
  })

  it('PROBAR_AVISO enseña un aviso de prueba con el permiso concedido', async () => {
    const arnes = nuevoArnes()

    const respuesta = await arnes.mensaje({ type: 'PROBAR_AVISO', titulo: 'Plantapps: aviso de prueba', cuerpo: 'Hola' })

    expect(respuesta).toEqual({ type: 'AVISO_DE_PRUEBA', ok: true })
    expect(arnes.mostradas[0]?.titulo).toBe('Plantapps: aviso de prueba')
  })

  it('PROBAR_AVISO sin permiso lo dice en vez de fingir', async () => {
    const arnes = nuevoArnes({ permiso: 'denied' })

    const respuesta = await arnes.mensaje({ type: 'PROBAR_AVISO', titulo: 'x', cuerpo: 'y' })

    expect(respuesta).toEqual({ type: 'AVISO_DE_PRUEBA', ok: false, motivo: 'sin-permiso' })
    expect(arnes.mostradas).toHaveLength(0)
  })
})

describe('CANCELAR_AVISOS lo deja todo fuera', () => {
  it('borra la lista y cancela los temporizadores', async () => {
    const arnes = nuevoArnes()
    await arnes.mensaje({ type: 'SINCRONIZAR_AVISOS', items: [aviso('a', 150)] })

    const respuesta = await arnes.mensaje({ type: 'CANCELAR_AVISOS' })
    await esperar(300)

    expect(respuesta).toEqual({ type: 'ESTADO_AVISOS', programados: 0 })
    expect(arnes.mostradas).toHaveLength(0)
    expect(await leerGuardados()).toEqual([])
  })
})

describe('al tocar el aviso se abre la app', () => {
  it('enfoca la ventana que ya está abierta', async () => {
    let enfocada = 0
    const ventana: VentanaFalsa = {
      url: 'https://franlg.github.io/Plantapps/ajustes',
      focus: async () => {
        enfocada += 1
      },
    }
    const arnes = nuevoArnes({ ventanas: [ventana] })
    let cerrada = 0

    await arnes.despachar('notificationclick', {
      notification: {
        close: () => {
          cerrada += 1
        },
      },
    })

    expect(cerrada).toBe(1)
    expect(enfocada).toBe(1)
    expect(arnes.abiertas).toEqual([])
  })

  it('si no hay ninguna ventana abierta, abre la app', async () => {
    const arnes = nuevoArnes()

    await arnes.despachar('notificationclick', { notification: { close: () => {} } })

    expect(arnes.abiertas).toEqual(['https://franlg.github.io/Plantapps/'])
  })
})