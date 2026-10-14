# Plantapps — Guía para agentes

## Qué es
PWA (Progressive Web App) Android para el control de plantas personales:
- Registrar cuándo se plantó, cuándo se regó, comentarios con fecha
- Hacer una foto y que la IA diga si toca regar, si hay que trasplantar,
  si tiene algún problema o si está todo correcto
- Los datos viven **solo en el dispositivo** (IndexedDB). Sin cuentas, sin servidor.

**URL pública:** https://franlg.github.io/Plantapps/
**Repo:** https://github.com/franlg/Plantapps

## Stack

| Capa | Tecnología |
|---|---|
| Build | Vite 8 |
| UI | React 19 + TypeScript 6 (estricto) |
| Estilos | Tailwind CSS 4 (`@tailwindcss/vite`) |
| Datos | Dexie 4 (IndexedDB) |
| Validación | Zod 4 |
| Fechas | date-fns 4 |
| Tests | Vitest 5 + Testing Library |
| IA | Gemini API (REST directo, sin SDK) |
| PWA | Service worker a mano + manifest |

## Comandos

```bash
npm.cmd run dev        # desarrollo (http://localhost:5173/Plantapps/)
npm.cmd run verify     # PUERTA DE CALIDAD: typecheck + tests + build
npm.cmd test           # tests solos
npm.cmd run build      # build a dist/
```

**Regla de oro:** `npm run verify` debe estar en verde antes de cualquier `git push`.

## Estructura

```
src/
  types/                 Modelo de dominio: Plant, CareEvent, StoredPhoto, AiAnalysis, AppSettings
  services/
    contracts.ts         CONTRATOS congelados (interfaces de repos y servicios)
    ai/                  Cliente Gemini: prompt, esquema JSON, validación Zod
    photos/              Captura (cámara/galería), compresión, miniaturas
    reminders/           Motor de riego: 62 especies, estacionalidad, atención
    pwa/                 Service worker, instalabilidad, online, actualizaciones
  db/
    memory.ts            Implementación en memoria (tests)
    dexie.ts             Implementación real con IndexedDB
    context.tsx          Hooks React: usePlants, usePlant, useTimeline, useAnalyses, useAttention, usePhotoUrl, useSettings
    backup.ts            Exportar/importar copia (JSON + fotos en base64)
  ui/
    components/          17 componentes + tema (theme.css, index.css)
    screens/             Inicio, DetallePlanta, FormularioPlanta, Ajustes, navegación
  lib/                   Fechas, ids, utilidades
public/
  manifest.webmanifest   Instalabilidad
  sw.js                  Service worker (cache-first en assets, network-first en navegaciones)
  icons/                 PNG 192/512 (any + maskable) generados por scripts/generar-iconos.mjs
.github/workflows/
  deploy.yml             GitHub Actions: compila y publica en GitHub Pages
```

## Reglas de código

### TypeScript
- `"strict": true` activo
- **`verbatimModuleSyntax`**: los tipos se importan con `import type { X } from '...'`
- **`erasableSyntaxOnly`**: **PROHIBIDO** `enum`, `namespace` y parameter properties
  (`constructor(private x: T)`). Usa campos declarados y asignados en el constructor.
- Sin `any`. Sin `console.log` en código final.

### Arquitectura
- La interfaz solo habla con los datos a través de los hooks de `src/db/context.tsx`.
- Nunca llames a Dexie ni a la API de Gemini desde un componente: pídelo en `src/services/contracts.ts`.
- Toda escritura en la base de datos debe `notify()` para que los hooks se refresquen.

### Contratos
- Si cambias una interfaz en `contracts.ts`, debes actualizar **ambas** implementaciones
  (memoria y Dexie) o los tests lo detectarán.

### Estilos
- Mobile-first, objetivos táctiles de **44 px** mínimo.
- Tema claro/oscuro con clase `dark` en `<html>` y clave `localStorage('tema')`
  (valores: `'claro' | 'oscuro' | 'auto'`).
- Colores en tokens CSS (`--surface`, `--brand-*`, `--ok-*`, `--alerta-*`, `--peligro-*`).

### Tests
- Cada test empieza con `import '@testing-library/jest-dom/vitest'` (obligatorio).
- Los tests de pantallas envuelven en `<DbProvider db={createMemoryDb()}>` y crean
  una `db` nueva por test.
- `fake-indexeddb` está instalado para tests de la capa Dexie.

### IA (Gemini)
- La clave **nunca** va en el código ni en logs. Sale de `db.settings` (Ajustes).
- La app guarda la clave **solo en el móvil** (IndexedDB), nunca en el repo.
- Nivel gratuito: `gemini-3.6-flash` (principal) → `gemini-3.5-flash-lite` (respaldo).
- Errores de red se traducen a `AiError` con códigos accionables en español.

### Publicación
- El `base` de Vite **debe** coincidir con el nombre del repo, **incluida la capitalización**:
  el repo es `Plantapps`, así que `base: '/Plantapps/'`.
- El service worker **nunca** intercepta peticiones a `generativelanguage.googleapis.com`.
- Cada `git push` a `main` dispara el workflow: compila, pasa tests y publica.

## Cómo publicar cambios

```bash
npm.cmd run verify        # 1. puerta de calidad en verde
git add -A
git commit -m "descripcion"
git push origin main      # 2. GitHub Actions publica solo
```

La URL tarda 1-2 minutos en actualizarse tras cada push.
