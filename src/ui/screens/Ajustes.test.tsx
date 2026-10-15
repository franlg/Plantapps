import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Ajustes } from './Ajustes'
import { dbDePrueba, espiarObjectURL, renderConDb, usuario } from './entornoPrueba'
import {
  AVISO_BLOQUEADO,
  AVISO_LIMITACION,
  AVISO_NO_SOPORTADO,
  calcularAvisos,
  recordatorioScheduler,
} from '@/services/recordatorios'
import type { EstadoPlanificador, PermisoNotificaciones, RecordatorioProgramado } from '@/types'

/*
 * El planificador de avisos habla con el navegador y con el service worker: en
 * jsdom no hay ninguno de los dos. Se sustituye entero y se deja que cada
 * prueba diga en qué permiso estamos.
 */
vi.mock('@/services/recordatorios', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/recordatorios')>()
  return {
    ...original,
    recordatorioScheduler: {
      estado: vi.fn(async () => ({
        permiso: 'default' as PermisoNotificaciones,
        programados: 0,
        persistentes: true,
      })),
      pedirPermiso: vi.fn(async () => 'granted' as PermisoNotificaciones),
      sincronizar: vi.fn(async () => 0),
      cancelarTodos: vi.fn(async () => undefined),
      probar: vi.fn(async () => undefined),
    },
    calcularAvisos: vi.fn(async () => []),
  }
})

const estado = vi.mocked(recordatorioScheduler.estado)
const pedirPermiso = vi.mocked(recordatorioScheduler.pedirPermiso)
const sincronizar = vi.mocked(recordatorioScheduler.sincronizar)
const probar = vi.mocked(recordatorioScheduler.probar)
const calcular = vi.mocked(calcularAvisos)

/** Deja el navegador en un permiso concreto para la prueba que sea. */
function conPermiso(permiso: PermisoNotificaciones, extra: Partial<EstadoPlanificador> = {}) {
  estado.mockResolvedValue({ permiso, programados: 0, persistentes: true, ...extra })
}

/** Un aviso inventado: solo importa que llegue entero al service worker. */
function avisoFalso(id: string): RecordatorioProgramado {
  return {
    id,
    plantId: 'planta-1',
    titulo: 'Helecho: toca regar',
    cuerpo: 'Toca regar hoy',
    para: new Date(Date.now() + 86_400_000).toISOString(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  conPermiso('default')
  pedirPermiso.mockResolvedValue('granted')
  sincronizar.mockResolvedValue(0)
  probar.mockResolvedValue(undefined)
  calcular.mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')
  window.localStorage.clear()
})

describe('<Ajustes>', () => {
  it('avisa de que falta la clave y no la enseña en claro', async () => {
    const db = dbDePrueba()
    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

    expect(await screen.findByText(/Falta la clave/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Pega aquí tu clave/i)).toHaveAttribute('type', 'password')
  })

  it('guarda la clave en la base de datos sin dejar de escribirse en pantalla', async () => {
    const user = usuario()
    const db = dbDePrueba()
    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

    const campo = screen.getByLabelText(/Pega aquí tu clave/i)
    await user.type(campo, 'AIza-mi-clave')
    await user.click(screen.getByRole('button', { name: /Guardar clave/i }))

    await waitFor(async () => expect((await db.settings.get()).apiKey).toBe('AIza-mi-clave'))
    expect(await screen.findByText(/Clave configurada/i)).toBeInTheDocument()
    // El campo se vacía: la clave no se queda escrita a la vista.
    expect(campo).toHaveValue('')
  })

  it('exporta una copia de seguridad como archivo JSON descargable', async () => {
    const user = usuario()
    const db = dbDePrueba()
    await db.plants.create({ nombre: 'Cactus del despacho' })

    const espia = espiarObjectURL()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    try {
      renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

      await user.click(await screen.findByRole('button', { name: /Exportar copia/i }))

      await waitFor(() => expect(espia.createObjectURL).toHaveBeenCalledTimes(1))

      const [blob] = espia.createObjectURL.mock.calls[0] as [Blob]
      expect(blob.type).toBe('application/json')
      expect(click).toHaveBeenCalledTimes(1)

      const copia = JSON.parse(await blob.text()) as { formato: string; plants: unknown[] }
      expect(copia.formato).toBe('plantapps-backup')
      expect(copia.plants).toHaveLength(1)

      await waitFor(async () => expect((await db.settings.get()).ultimaCopia).toBeTruthy())
      expect(espia.revokeObjectURL).toHaveBeenCalled()
    } finally {
      espia.restore()
    }
  })

  it('avisa antes de sobrescribir y reconoce una copia de Plantapps', async () => {
    const user = usuario()
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    const campo = screen.getByLabelText('Archivo de copia de seguridad')

    await user.upload(
      campo,
      new File(['{"formato":"plantapps-backup","plants":[{"nombre":"Helecho"}]}'], 'copia.json', {
        type: 'application/json',
      }),
    )

    expect(await screen.findByText('¿Restaurar esta copia?')).toBeInTheDocument()
    expect(screen.getByText(/trae 1 planta/)).toBeInTheDocument()
    expect(screen.getByText(/se borra todo lo que hay ahora/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('¿Restaurar esta copia?')).not.toBeInTheDocument()
  })

  it('dice que un archivo que no es suyo no parece una copia', async () => {
    const user = usuario()
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    await user.upload(
      screen.getByLabelText('Archivo de copia de seguridad'),
      new File(['{"hola":"que tal"}'], 'notas.json', { type: 'application/json' }),
    )

    expect(await screen.findByText('Este archivo no parece una copia')).toBeInTheDocument()
    expect(screen.getByText(/no lleva la marca de una copia de Plantapps/i)).toBeInTheDocument()
  })

  it('cambia entre tema claro y oscuro y lo recuerda', async () => {
    const user = usuario()
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    await user.click(await screen.findByRole('radio', { name: 'Oscuro' }))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('tema')).toBe('oscuro')

    await user.click(screen.getByRole('radio', { name: 'Claro' }))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem('tema')).toBe('claro')
  })

  it('restaura una planta archivada', async () => {
    const user = usuario()
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Oreja de elefante' })
    await db.plants.setArchivada(planta.id, true)

    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

    await user.click(await screen.findByRole('button', { name: /Restaurar/i }))

    await waitFor(async () => expect(await db.plants.list()).toHaveLength(1))
    expect(planta.nombre).toBe('Oreja de elefante')
  })

  it('explica que todo vive en el dispositivo', async () => {
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    expect(await screen.findByText(/se guardan solo en este dispositivo/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /aistudio\.google\.com\/apikey/i })).toHaveAttribute(
      'href',
      'https://aistudio.google.com/apikey',
    )
  })

  // --- Recordatorios de riego -------------------------------------------

  it('enseña la sección de recordatorios de riego', async () => {
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    expect(await screen.findByRole('heading', { name: /Recordatorios de riego/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Avisarme cuando toque regar/i })).toBeInTheDocument()
    expect(screen.getByText(/Sin decidir/i)).toBeInTheDocument()
    // El límite de Android se dice siempre, sin esconderlo.
    expect(screen.getByText(AVISO_LIMITACION)).toBeInTheDocument()
  })

  it('ofrece pedir permiso cuando el usuario todavía no ha decidido', async () => {
    const user = usuario()
    conPermiso('default')
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    const boton = await screen.findByRole('button', { name: /Permitir notificaciones/i })
    await user.click(boton)

    expect(pedirPermiso).toHaveBeenCalledTimes(1)
  })

  it('explica cómo reactivar unas notificaciones bloqueadas y no vuelve a preguntarlas', async () => {
    conPermiso('denied')
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    expect(await screen.findByText(/Bloqueados/i)).toBeInTheDocument()
    // El aviso del módulo más la ruta de los ajustes de Android, en el mismo párrafo.
    expect(screen.getByText(/Abre los ajustes de tu móvil/i)).toHaveTextContent(AVISO_BLOQUEADO)
    expect(screen.getByText(/Abre los ajustes de tu móvil/i)).toHaveTextContent(
      /Apps → Chrome → Notificaciones/i,
    )

    // Ofrecer el botón otra vez sería engañoso: el navegador ya dijo que no.
    expect(screen.queryByRole('button', { name: /Permitir notificaciones/i })).not.toBeInTheDocument()
    expect(pedirPermiso).not.toHaveBeenCalled()
  })

  it('calcula y sincroniza los avisos cuando el permiso está concedido', async () => {
    const db = dbDePrueba()
    await db.plants.create({ nombre: 'Helecho' })
    await db.settings.save({ recordatorios: { activos: true, hora: '09:00', diasAnticipacion: 0 } })

    const avisos = [avisoFalso('a'), avisoFalso('b'), avisoFalso('c')]
    calcular.mockResolvedValue(avisos)
    sincronizar.mockResolvedValue(3)
    conPermiso('granted')

    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

    await waitFor(() => expect(sincronizar).toHaveBeenCalledWith(avisos))
    expect(calcular).toHaveBeenCalledWith(db, expect.objectContaining({ activos: true, hora: '09:00' }))
    expect(await screen.findByText('3 plantas tienen un aviso programado.')).toBeInTheDocument()
  })

  it('vuelve a sincronizar cuando la app vuelve a primer plano', async () => {
    const db = dbDePrueba()
    await db.plants.create({ nombre: 'Helecho' })
    await db.settings.save({ recordatorios: { activos: true, hora: '09:00', diasAnticipacion: 0 } })
    conPermiso('granted')

    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })
    await waitFor(() => expect(sincronizar).toHaveBeenCalledTimes(1))

    document.dispatchEvent(new Event('visibilitychange'))

    // Relee el permiso y rearma los avisos, aunque el permiso no haya cambiado.
    await waitFor(() => expect(estado).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(sincronizar).toHaveBeenCalledTimes(2))
  })

  it('cambiar la hora guarda los recordatorios sin borrar la clave de la API', async () => {
    const db = dbDePrueba()
    await db.settings.save({ apiKey: 'AIza-guardada' })

    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })
    expect(await screen.findByText(/Clave configurada/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Hora del aviso/i), { target: { value: '07:30' } })

    await waitFor(async () => expect((await db.settings.get()).recordatorios.hora).toBe('07:30'))
    const guardado = await db.settings.get()
    // Merge de verdad: la clave y el resto de ajustes siguen intactos.
    expect(guardado.apiKey).toBe('AIza-guardada')
    expect(guardado.recordatorios).toEqual({ activos: false, hora: '07:30', diasAnticipacion: 0 })
    expect(guardado.modelo).toBeTruthy()
  })

  it('activar el interruptor guarda los recordatorios con activos en true', async () => {
    const user = usuario()
    const db = dbDePrueba()
    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

    const interruptor = await screen.findByRole('switch', { name: /Avisarme cuando toque regar/i })
    expect(interruptor).toHaveAttribute('aria-checked', 'false')

    await user.click(interruptor)

    await waitFor(async () => expect((await db.settings.get()).recordatorios.activos).toBe(true))
    expect(await screen.findByRole('switch', { name: /Avisarme cuando toque regar/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('cambiar la antelación la guarda sin tocar los otros ajustes', async () => {
    const user = usuario()
    const db = dbDePrueba()
    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

    await user.click(await screen.findByRole('radio', { name: '2 días antes' }))

    await waitFor(async () => expect((await db.settings.get()).recordatorios.diasAnticipacion).toBe(2))
    expect((await db.settings.get()).recordatorios.hora).toBe('09:00')
  })

  it('sin soporte de notificaciones deja la sección entera deshabilitada y sin botones inútiles', async () => {
    conPermiso('no-soportado')
    renderConDb(<Ajustes />, { db: dbDePrueba(), ruta: '/ajustes' })

    expect(await screen.findByText(AVISO_NO_SOPORTADO)).toBeInTheDocument()
    await screen.findByText(/No disponible en este navegador/i)

    expect(screen.getByRole('switch', { name: /Avisarme cuando toque regar/i })).toBeDisabled()
    expect(screen.getByLabelText(/Hora del aviso/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /Probar notificación/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Permitir notificaciones/i })).not.toBeInTheDocument()
  })

  it('probar la notificación avisa del envío y recoge el error si falla', async () => {
    const user = usuario()
    const db = dbDePrueba()
    await db.settings.save({ recordatorios: { activos: true, hora: '09:00', diasAnticipacion: 0 } })
    conPermiso('granted')

    renderConDb(<Ajustes />, { db, ruta: '/ajustes' })

    await user.click(await screen.findByRole('button', { name: /Probar notificación/i }))
    await screen.findByText(/Aviso de prueba enviado/i)
    expect(probar).toHaveBeenCalledTimes(1)

    probar.mockRejectedValueOnce(new Error('Las notificaciones están bloqueadas para Plantapps.'))
    await user.click(screen.getByRole('button', { name: /Probar notificación/i }))

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('No se ha podido probar la notificación')
    expect(aviso).toHaveTextContent('Las notificaciones están bloqueadas para Plantapps.')
  })
})