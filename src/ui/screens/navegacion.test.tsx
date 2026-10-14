/**
 * PRUEBAS DE LAS RUTAS Y DE LA BARRA DE NAVEGACIÓN
 * ===============================================
 * La barra y la tabla de rutas viven en `src/ui/navegacion.tsx`, pero estas
 * pruebas se quedan en la carpeta de pantallas para no salir de la zona de
 * archivos del agente de interfaz.
 */

import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DbProvider } from '@/db/context'
import { BarraNavegacion, RutasApp } from '@/ui/navegacion'
import { dbDePrueba, MARCA_DE_FUERA, usuario } from './entornoPrueba'

function montar(ruta: string) {
  return render(
    <DbProvider db={dbDePrueba()}>
      <MemoryRouter initialEntries={[ruta]}>
        <RutasApp />
        <BarraNavegacion />
      </MemoryRouter>
    </DbProvider>,
  )
}

describe('Rutas de la app', () => {
  it('la raíz muestra Inicio', async () => {
    montar('/')
    expect(await screen.findByRole('heading', { name: 'Mis plantas' })).toBeInTheDocument()
  })

  it('/planta/nueva muestra el alta de planta', async () => {
    montar('/planta/nueva')
    expect(await screen.findByRole('heading', { name: 'Nueva planta' })).toBeInTheDocument()
  })

  it('/ajustes muestra los ajustes', async () => {
    montar('/ajustes')
    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument()
  })

  it('una ruta desconocida explica que no existe', async () => {
    montar('/inventado')
    expect(await screen.findByText('Esta pantalla no existe')).toBeInTheDocument()
  })

  it('la barra lleva a Inicio, Ajustes y al alta de planta', async () => {
    const user = usuario()
    montar('/')

    const barra = screen.getByRole('navigation', { name: 'Navegación principal' })

    await user.click(screen.getByRole('link', { name: /Ajustes/ }))
    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Añadir planta' }))
    expect(await screen.findByRole('heading', { name: 'Nueva planta' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /Inicio/ }))
    expect(await screen.findByRole('heading', { name: 'Mis plantas' })).toBeInTheDocument()

    expect(barra).toBeInTheDocument()
  })

  it('la ficha de una planta se abre con su identificador', async () => {
    const db = dbDePrueba()
    const planta = await db.plants.create({ nombre: 'Helecho del baño' })

    render(
      <DbProvider db={db}>
        <MemoryRouter initialEntries={[`/planta/${planta.id}`]}>
          <RutasApp />
          <BarraNavegacion />
        </MemoryRouter>
      </DbProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Helecho del baño' })).toBeInTheDocument()
  })

  it('una planta que no existe avisa en vez de romperse', async () => {
    montar('/planta/no-existe')
    expect(await screen.findByText('Esta planta ya no está')).toBeInTheDocument()
    expect(screen.queryByText(MARCA_DE_FUERA)).not.toBeInTheDocument()
  })
})