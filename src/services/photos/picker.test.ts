import { afterEach, describe, expect, it } from 'vitest'
import { base64ABlob, blobABase64, bytesABase64, pickPhoto } from './picker'
import { blobDePrueba } from './test-utils'

/** El input que `pickPhoto` deja en el body mientras espera. */
function inputActivo(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[type="file"]')
}

function archivoFalso(nombre = 'foto.jpg'): File {
  return new File(['contenido de prueba'], nombre, { type: 'image/jpeg' })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('pickPhoto', () => {
  it('abre la cámara con capture="environment" y devuelve el archivo elegido', async () => {
    const promesa = pickPhoto('camara', { timeoutMs: 1000 })

    const input = inputActivo()
    expect(input).not.toBeNull()
    expect(input?.accept).toBe('image/*')
    expect(input?.getAttribute('capture')).toBe('environment')

    const archivo = archivoFalso()
    Object.defineProperty(input, 'files', { value: [archivo], configurable: true })
    input?.dispatchEvent(new Event('change'))

    await expect(promesa).resolves.toBe(archivo)
    expect(inputActivo()).toBeNull()
  })

  it('no pone capture al elegir de la galería', async () => {
    const promesa = pickPhoto('galeria', { timeoutMs: 50 })
    const input = inputActivo()

    expect(input?.hasAttribute('capture')).toBe(false)
    input?.dispatchEvent(new Event('cancel'))

    await expect(promesa).resolves.toBeNull()
    expect(inputActivo()).toBeNull()
  })

  it('devuelve null si el usuario cancela', async () => {
    const promesa = pickPhoto('camara', { timeoutMs: 1000 })
    inputActivo()?.dispatchEvent(new Event('cancel'))

    await expect(promesa).resolves.toBeNull()
    expect(inputActivo()).toBeNull()
  })

  it('devuelve null y limpia el DOM si la app de cámara no devuelve nada', async () => {
    const promesa = pickPhoto('camara', { timeoutMs: 20 })
    expect(inputActivo()).not.toBeNull()

    await expect(promesa).resolves.toBeNull()
    expect(inputActivo()).toBeNull()
  })

  it('ignora el evento change sin archivos', async () => {
    const promesa = pickPhoto('galeria', { timeoutMs: 20 })
    const input = inputActivo()
    Object.defineProperty(input, 'files', { value: [], configurable: true })
    input?.dispatchEvent(new Event('change'))

    await expect(promesa).resolves.toBeNull()
    expect(inputActivo()).toBeNull()
  })

  it('elimina el input aunque pickPhoto falle', async () => {
    document.body.appendChild(document.createElement('span'))
    const promesa = pickPhoto('camara', { timeoutMs: 10 })
    inputActivo()?.dispatchEvent(new Event('change'))

    await promesa
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0)
    expect(document.body.querySelector('span')).not.toBeNull()
  })
})

describe('conversión a base64', () => {
  it('ida y vuelta devuelve exactamente los mismos bytes', async () => {
    const blob = blobDePrueba('image/jpeg', 256)

    const base64 = await blobABase64(blob)
    const vuelta = await base64ABlob(base64, 'image/jpeg')

    expect(typeof base64).toBe('string')
    expect(base64).not.toContain('data:')
    expect(new Uint8Array(await vuelta.arrayBuffer())).toEqual(new Uint8Array(await blob.arrayBuffer()))
    expect(vuelta.type).toBe('image/jpeg')
  })

  it('aguanta blobs grandes sin reventar la pila', async () => {
    const blob = blobDePrueba('image/png', 200_000)

    const base64 = await blobABase64(blob)
    const vuelta = await base64ABlob(base64, 'image/png')

    expect(vuelta.size).toBe(200_000)
    expect(new Uint8Array(await vuelta.arrayBuffer())[199_999]).toBe(
      new Uint8Array(await blob.arrayBuffer())[199_999],
    )
  })

  it('acepta una data URL completa', async () => {
    const base64 = await blobABase64(blobDePrueba('image/jpeg', 64))
    const blob = await base64ABlob(`data:image/jpeg;base64,${base64}`, 'image/jpeg')

    expect(blob.size).toBe(64)
    expect(blob.type).toBe('image/jpeg')
  })

  it('codifica bytes sueltos a base64', () => {
    expect(bytesABase64(new Uint8Array([104, 111, 108, 97]))).toBe('aG9sYQ==')
    expect(bytesABase64(new Uint8Array())).toBe('')
  })
})