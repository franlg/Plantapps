import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecordatorioProgramado, RecordatorioScheduler } from '@/types'
import { AVISO_BLOQUEADO, AVISO_LIMITACION, AVISO_NO_SOPORTADO, createRecordatorioScheduler } from './index'

/**
 * jsdom no trae notificaciones ni service workers, que es justo lo que hay que
 * probar: que la app se comporte bien cuando no existen. Aquí se instalan las
 * dos imitaciones (y se quitan al terminar cada test).
 */

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

interface Lanzada {
  titulo: string
  opciones?: NotificationOptions
}

class NotificacionFalsa {
  static permission: NotificationPermission = 'default'
  static lanzadas: Lanzada[] = []
  static requestPermission: () => Promise<NotificationPermission> = async () => 'granted'

  titulo: string

  constructor(titulo: string, opciones?: NotificationOptions) {
    this.titulo = titulo
    NotificacionFalsa.lanzadas.push({ titulo, opciones })
  }
}

function instalarNotificaciones(permiso: NotificationPermission): void {
  NotificacionFalsa.permission = permiso
  NotificacionFalsa.lanzadas = []
  NotificacionFalsa.requestPermission = async () => (permiso === 'default' ? 'granted' : permiso)
  Object.defineProperty(window, 'Notification', { value: NotificacionFalsa, configurable: true, writable: true })
}

function quitarNotificaciones(): void {
  Reflect.deleteProperty(window, 'Notification')
}

// ---------------------------------------------------------------------------
// Service worker
// ---------------------------------------------------------------------------

interface MensajeRecibido {
  type?: string
  items?: RecordatorioProgramado[]
}

interface ControladorFalso {
  postMessage: (mensaje: unknown, transfer: Transferable[]) => void
  recibidos: MensajeRecibido[]
}

/**
 * Instala un `navigator.serviceWorker` con un controller ya activo. Si se pasa
 * `responder`, ese callback recibe cada mensaje y el `MessagePort` para
 * contestar como lo haría el worker de verdad.
 */
function instalarServiceWorker(
  responder?: (mensaje: MensajeRecibido, puerto: MessagePort) => void,
): ControladorFalso {
  const control: ControladorFalso = {
    recibidos: [],
    postMessage(mensaje: unknown, transfer: Transferable[]) {
      control.recibidos.push(mensaje as MensajeRecibido)
      if (responder) responder(mensaje as MensajeRecibido, transfer[0] as unknown as MessagePort)
    },
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { controller: control, ready: Promise.resolve({ active: control }) },
    configurable: true,
    writable: true,
  })
  return control
}

function quitarServiceWorker(): void {
  Reflect.deleteProperty(navigator, 'serviceWorker')
}

/** Planificador con esperas cortísimas: los tests no pueden tardar 1,5 s. */
function planificador(): RecordatorioScheduler {
  return createRecordatorioScheduler({ timeoutMs: 30 })
}

/** Un aviso de ejemplo dentro de una hora (siempre futuro). */
function avisoFuturo(plantId = 'planta-1', enMinutos = 60): RecordatorioProgramado {
  return {
    id: `${plantId}:2026-05-21T09:00:00.000Z`,
    plantId,
    titulo: 'Monstera: toca regar',
    cuerpo: 'Toca regar mañana',
    para: new Date(Date.now() + enMinutos * 60_000).toISOString(),
  }
}

afterEach(() => {
  quitarNotificaciones()
  quitarServiceWorker()
  vi.restoreAllMocks()
})

describe('sin notificaciones en el navegador', () => {
  it('estado() lo dice sin lanzar', async () => {
    const estado = await planificador().estado()

    expect(estado.permiso).toBe('no-soportado')
    expect(estado.programados).toBe(0)
    expect(estado.persistentes).toBe(false)
    expect(estado.aviso).toBe(AVISO_NO_SOPORTADO)
  })

  it('sigue funcionando con service worker pero sin notificaciones', async () => {
    instalarServiceWorker()
    const estado = await planificador().estado()

    expect(estado.permiso).toBe('no-soportado')
    expect(estado.persistentes).toBe(true)
  })

  it('pedirPermiso() devuelve "no-soportado" y no lanza', async () => {
    await expect(planificador().pedirPermiso()).resolves.toBe('no-soportado')
  })

  it('sincronizar() no rompe: devuelve 0 y no manda nada', async () => {
    const control = instalarServiceWorker()

    await expect(planificador().sincronizar([avisoFuturo()])).resolves.toBe(0)
    expect(control.recibidos).toHaveLength(0)
  })

  it('cancelarTodos() y probar() se comportan con dignidad', async () => {
    await expect(planificador().cancelarTodos()).resolves.toBeUndefined()
    await expect(planificador().probar()).rejects.toThrow(/no admite notificaciones/)
  })
})

describe('pedirPermiso()', () => {
  it('devuelve lo que conteste el navegador', async () => {
    instalarNotificaciones('default')
    await expect(planificador().pedirPermiso()).resolves.toBe('granted')

    instalarNotificaciones('denied')
    await expect(planificador().pedirPermiso()).resolves.toBe('denied')
  })

  it('nunca lanza, aunque el navegador reviente', async () => {
    instalarNotificaciones('default')
    NotificacionFalsa.requestPermission = async () => {
      throw new Error('requestPermission() requires a user gesture')
    }

    await expect(planificador().pedirPermiso()).resolves.toBe('denied')
  })

  it('nunca lanza, aunque devuelva una tontería', async () => {
    instalarNotificaciones('default')
    NotificacionFalsa.requestPermission = async () => 'quiza' as NotificationPermission

    await expect(planificador().pedirPermiso()).resolves.toBe('denied')
  })
})

describe('estado()', () => {
  it('lee el permiso y cuenta lo que tiene programado el worker', async () => {
    instalarNotificaciones('granted')
    instalarServiceWorker((mensaje, puerto) => {
      if (mensaje.type === 'PEDIR_ESTADO_AVISOS') {
        puerto.postMessage({ type: 'ESTADO_AVISOS', programados: 3 })
      }
    })

    const estado = await planificador().estado()

    expect(estado.permiso).toBe('granted')
    expect(estado.programados).toBe(3)
    expect(estado.persistentes).toBe(true)
    expect(estado.aviso).toBe(AVISO_LIMITACION)
  })

  it('con el permiso bloqueado explica cómo desbloquearlo', async () => {
    instalarNotificaciones('denied')
    instalarServiceWorker()

    const estado = await planificador().estado()

    expect(estado.permiso).toBe('denied')
    expect(estado.programados).toBe(0)
    expect(estado.aviso).toBe(AVISO_BLOQUEADO)
  })

  it('si el worker no contesta a tiempo, programados vale 0 y no se rompe nada', async () => {
    instalarNotificaciones('granted')
    // Worker mudo: no responde nunca y el planificador tiene que renunciar solo.
    instalarServiceWorker()

    const estado = await planificador().estado()

    expect(estado.permiso).toBe('granted')
    expect(estado.programados).toBe(0)
  })

  it('ignora una respuesta que no es del worker', async () => {
    instalarNotificaciones('granted')
    instalarServiceWorker((_mensaje, puerto) => puerto.postMessage({ tipo: 'ESTADO_AVISOS', programados: 'muchos' }))

    await expect(planificador().estado()).resolves.toMatchObject({ programados: 0 })
  })
})

describe('sincronizar()', () => {
  it('manda la lista COMPLETA al service worker', async () => {
    instalarNotificaciones('granted')
    const control = instalarServiceWorker((_mensaje, puerto) =>
      puerto.postMessage({ type: 'ESTADO_AVISOS', programados: 2 }),
    )

    const avisos = [
      avisoFuturo('planta-2', 120),
      avisoFuturo('planta-1', 60),
      // Uno que ya pasó: no se manda, así que el worker lo cancela.
      { ...avisoFuturo('planta-3'), para: new Date(Date.now() - 60_000).toISOString() },
    ]

    const programados = await planificador().sincronizar(avisos)

    expect(control.recibidos).toHaveLength(1)
    expect(control.recibidos[0]?.type).toBe('SINCRONIZAR_AVISOS')
    // Solo los dos válidos, y ordenados por fecha para que el worker sea tonto.
    expect(control.recibidos[0]?.items?.map((i) => i.plantId)).toEqual(['planta-1', 'planta-2'])
    expect(programados).toBe(2)
  })

  it('devuelve 0 sin permiso y sin service worker', async () => {
    const control = instalarServiceWorker()

    instalarNotificaciones('denied')
    await expect(planificador().sincronizar([avisoFuturo()])).resolves.toBe(0)
    expect(control.recibidos).toHaveLength(0)

    instalarNotificaciones('granted')
    quitarServiceWorker()
    await expect(planificador().sincronizar([avisoFuturo()])).resolves.toBe(0)
  })

  it('descarta los avisos sin fecha válida antes de mandarlos', async () => {
    instalarNotificaciones('granted')
    const control = instalarServiceWorker((_mensaje, puerto) => puerto.postMessage({ type: 'ESTADO_AVISOS', programados: 0 }))

    const sucios = [
      { ...avisoFuturo('buena'), para: 'no-es-una-fecha' },
      { ...avisoFuturo('sin-id'), id: '' },
      { ...avisoFuturo('sin-titulo'), titulo: undefined as unknown as string },
      avisoFuturo('buena'),
    ]

    await expect(planificador().sincronizar(sucios)).resolves.toBe(0)
    expect(control.recibidos[0]?.items?.map((i) => i.plantId)).toEqual(['buena'])
  })

  it('si el worker no contesta, devuelve lo enviado como mejor estimación', async () => {
    instalarNotificaciones('granted')
    instalarServiceWorker()

    await expect(planificador().sincronizar([avisoFuturo('a'), avisoFuturo('b')])).resolves.toBe(2)
  })

  it('no se rompe si postMessage falla', async () => {
    instalarNotificaciones('granted')
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        controller: {
          postMessage() {
            throw new DOMException('could not be cloned', 'DataCloneError')
          },
        },
        // Nunca resuelve (como un worker que no llega a activarse): aquí no se
        // espera, pero tampoco se deja una promesa rechazada suelta.
        ready: new Promise(() => {}),
      },
      configurable: true,
      writable: true,
    })

    await expect(planificador().sincronizar([avisoFuturo('a'), avisoFuturo('b')])).resolves.toBe(2)
  })
})

describe('cancelarTodos()', () => {
  it('manda el mensaje de cancelar y espera la respuesta', async () => {
    instalarNotificaciones('granted')
    const control = instalarServiceWorker((_mensaje, puerto) => puerto.postMessage({ type: 'ESTADO_AVISOS', programados: 0 }))

    await expect(planificador().cancelarTodos()).resolves.toBeUndefined()
    expect(control.recibidos).toEqual([{ type: 'CANCELAR_AVISOS' }])
  })

  it('sin service worker no hace nada y no lanza', async () => {
    await expect(planificador().cancelarTodos()).resolves.toBeUndefined()
  })
})

describe('probar()', () => {
  it('sin permiso lanza un error que dice qué hacer', async () => {
    instalarNotificaciones('default')
    await expect(planificador().probar()).rejects.toThrow(/Primero hay que activar las notificaciones/)

    instalarNotificaciones('denied')
    await expect(planificador().probar()).rejects.toThrow(/bloqueadas/)
  })

  it('con permiso usa el service worker para mostrarlo', async () => {
    instalarNotificaciones('granted')
    const control = instalarServiceWorker((mensaje, puerto) => {
      expect(mensaje.type).toBe('PROBAR_AVISO')
      puerto.postMessage({ type: 'AVISO_DE_PRUEBA', ok: true })
    })

    await expect(planificador().probar()).resolves.toBeUndefined()
    expect(control.recibidos[0]?.type).toBe('PROBAR_AVISO')
    // El worker lo mostró: no debe salir además una notificación de la página.
    expect(NotificacionFalsa.lanzadas).toHaveLength(0)
  })

  it('sin service worker cae a new Notification', async () => {
    instalarNotificaciones('granted')

    await expect(planificador().probar()).resolves.toBeUndefined()
    expect(NotificacionFalsa.lanzadas).toHaveLength(1)
    expect(NotificacionFalsa.lanzadas[0]?.titulo).toContain('Plantapps')
    expect(NotificacionFalsa.lanzadas[0]?.opciones?.body).toBeTruthy()
  })

  it('si el worker dice que no pudo, el error lo explica', async () => {
    instalarNotificaciones('granted')
    instalarServiceWorker((_mensaje, puerto) => puerto.postMessage({ type: 'AVISO_DE_PRUEBA', ok: false }))

    await expect(planificador().probar()).rejects.toThrow(/No se ha podido mostrar/)
  })

  it('si ni el worker ni la página pueden, el error lo explica', async () => {
    instalarNotificaciones('granted')
    Object.defineProperty(window, 'Notification', {
      // Con permiso concedido, pero el navegador se niega a mostrar nada
      // (típico de los motores que exigen service worker).
      value: Object.assign(
        function NotificacionRota() {
          throw new Error('NotAllowedError')
        },
        { permission: 'granted' as NotificationPermission },
      ),
      configurable: true,
      writable: true,
    })

    await expect(planificador().probar()).rejects.toThrow(/No se ha podido mostrar el aviso de prueba/)
  })
})

describe('el planificador no rompe nunca la app', () => {
  it('con un service worker que responde cualquier cosa, todo sigue en silencio', async () => {
    instalarNotificaciones('granted')
    instalarServiceWorker(() => {
      throw new Error('el worker ha muerto')
    })

    const plan = planificador()
    await expect(plan.estado()).resolves.toMatchObject({ permiso: 'granted', programados: 0 })
    await expect(plan.sincronizar([avisoFuturo('a'), avisoFuturo('b')])).resolves.toBe(2)
    await expect(plan.cancelarTodos()).resolves.toBeUndefined()
  })

  it('createRecordatorioScheduler devuelve una instancia con los cinco métodos', () => {
    const planificador = createRecordatorioScheduler()

    expect(Object.keys(planificador).sort()).toEqual([
      'cancelarTodos',
      'estado',
      'pedirPermiso',
      'probar',
      'sincronizar',
    ])
  })
})