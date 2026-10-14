# Plantapps

App personal (PWA) para llevar el control de las plantas de casa: cuándo las planté, cuándo las regué,
comentarios con fecha y **una foto con IA que te dice si toca regar, trasplantar, si tiene un problema o si está todo bien**.

Se instala en el móvil como una app normal (icono, pantalla completa, funciona sin internet).
Los datos viven **solo en el dispositivo** (IndexedDB). No hay cuentas, ni servidores, ni nube.

---

## Puesta en marcha para desarrollar

```powershell
npm.cmd install       # en Windows; en macOS/Linux: npm install
npm.cmd run dev       # servidor de desarrollo (http://localhost:5173/plantapps/)
npm.cmd run verify    # puerta de calidad: tipos + tests + compilación
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente. |
| `npm run build` | Compila a `dist/`. |
| `npm run typecheck` | Comprueba los tipos (TypeScript estricto). |
| `npm run test` | Tests unitarios (Vitest). |
| `npm run verify` | **typecheck + test + build**. Es la puerta que debe pasar todo. |

---

## Cómo está organizada

```
src/
  types/            Modelo de dominio (Plant, CareEvent, AiAnalysis, AppSettings...).
  services/
    contracts.ts    CONTRATOS: interfaces de repositorios y servicios. Frozen.
    ai/             Cliente de Gemini: prompt, esquema JSON y validación con Zod.
    photos/         Captura, compresión y almacenamiento de imágenes.
    reminders/      Motor de recordatorios de riego (compartido por las dos bases de datos).
  db/
    contracts       (en services)
    memory.ts       Implementación en memoria (tests y desarrollo).
    dexie.ts        Implementación real con IndexedDB.
    context.tsx     Hooks de React: usePlants, usePlant, useTimeline, useAnalyses...
    backup.ts       Exportar/importar copia de seguridad en un JSON.
  ui/
    components/     Componentes reutilizables y tema.
    screens/        Pantallas de la app.
```

**Regla de oro:** la interfaz solo habla con la capa de datos a través de los hooks de `src/db/context.tsx`.
Nunca hables con Dexie ni con la API de Gemini desde un componente: si lo necesitas, pídelo en `src/services/contracts.ts`.

---

## La IA (Gemini, nivel gratuito)

1. Ve a <https://aistudio.google.com/apikey> con tu cuenta de Gmail.
2. **Create API key** → **Get started**. No hace falta tarjeta ni plan de pago.
3. Pégala en **Ajustes → Clave de la API** dentro de la app.

La clave se guarda **solo en tu móvil**. No está en el repositorio ni en el hosting.
Solo se usa si pulsas "Analizar con IA": el resto de la app funciona sin internet.

El modelo recibe la foto **más** el contexto real de la planta (especie, maceta, luz, último riego y días
transcurridos, frecuencia objetivo, historial) para poder responder "regar o no regar" con sentido.

---

## Publicar en GitHub Pages

1. Sube el repositorio a GitHub como **público**.
2. `Settings → Pages → Source → GitHub Actions`.
3. Cada `git push` a `main` pasa `npm run verify` y publica la app.
4. La URL será `https://<tu-usuario>.github.io/plantapps/`.

> Si cambias el nombre del repositorio, actualiza `base` en `vite.config.ts`.

En el móvil: abrir la URL en Chrome → **Añadir a pantalla de inicio**.

---

## Copias de seguridad

Los datos son locales. Si borras los datos del navegador o desinstalas la PWA, los pierdes.
**Ajustes → Exportar copia** genera un archivo `.json` (incluidas las fotos) que puedes guardar en Drive o WhatsApp.
**Importar copia** los restaura.

---

## Stack

Vite 8 · React 19 · TypeScript 6 (estricto) · Tailwind CSS 4 · Dexie 4 (IndexedDB) · Zod 4 · date-fns 4 · Vitest 5