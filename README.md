# Plantapps

App personal para Android (PWA) para el control de las plantas de casa.

Se instala en el móvil como una app normal: icono propio, pantalla completa, funciona
**sin internet** y los datos viven **solo en el dispositivo** (IndexedDB).
No hay cuentas, ni servidores, ni nube.

**URL:** https://franlg.github.io/Plantapps/ · **Repo:** https://github.com/franlg/Plantapps

---

## Qué hace la app

| Función | Detalle |
|---|---|
| **Plantas** | Nombre, especie, fecha de plantado, frecuencia de riego, maceta, ubicación, luz, notas y foto de portada. Archivables (no se borran, se ocultan). |
| **Historial** | Riego, fertilización, trasplante, poda y comentarios, cada uno con fecha. Agrupado por mes en la ficha. |
| **Análisis con IA** | Una foto y la IA dice si toca regar, si hay que trasplantar, si tiene un problema o si está todo bien. Salud 0-100, acción principal, frecuencia recomendada, síntomas y recomendaciones. |
| **Comparación** | Dos fotos en una sola petición: la IA dice si la planta **ha mejorado, sigue igual o ha empeorado** desde la última foto. Si no puede comparar (ángulo o luz distintos), lo dice en vez de adivinar. |
| **Guía de cuidados** | La IA escribe una guía por secciones (riego, luz, sustrato, temperatura, fertilización, problemas típicos) con la dificultad de la planta. Se regenera cuando quieras. |
| **¿Qué planta es?** | No sabes la especie: la IA la identifica desde la foto y te ofrece rellenar especie, frecuencia y luz **con confirmación**, nunca escribiendo solo. |
| **Galería de progreso** | Cada análisis guarda su foto: una tira cronológica para ver cómo evoluciona la planta. |
| **Requieren atención** | En el inicio, qué plantas necesitan riego ahora mismo, ordenadas por urgencia. |
| **Riego rápido** | Botón "Regar" en las tarjetas que lo necesitan, sin abrir la ficha. |
| **Recordatorios** | Aviso del sistema cuando toca regar, con hora y antelación configurables. |
| **Copia de seguridad** | Exportar/importar todo (plantas, historial, análisis y guías, con las fotos) en un único `.json`. |
| **Tema claro/oscuro** | Conmutable, respeta el sistema. |
| **Instalable** | Añadir a pantalla de inicio desde Chrome. |

---

## Puesta en marcha para desarrollar

```powershell
npm.cmd install       # en Windows; en macOS/Linux: npm install
npm.cmd run dev       # servidor de desarrollo (http://localhost:5173/Plantapps/)
npm.cmd run verify    # PUERTA DE CALIDAD: typecheck + tests + build
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
  types/            Modelo de dominio: Plant, CareEvent, StoredPhoto, AiAnalysis,
                    AppSettings, GuiaCuidados, FotoProgreso
  services/
    contracts.ts    CONTRATOS: interfaces de repos y servicios. Frozen.
    ai/             Cliente Gemini: prompt, esquema JSON, validación Zod, comparación
    photos/         Captura (cámara/galería/la de la ficha), compresión, miniaturas
    reminders/      Motor de riego: 62 especies, estacionalidad, atención
    recordatorios/  Avisos del sistema vía service worker + cálculo de qué programar
    pwa/            Instalabilidad, online, actualizaciones, registro del SW
  db/
    memory.ts       Implementación en memoria (tests)
    dexie.ts        Implementación real con IndexedDB (tabla guides con migración v1→v2)
    context.tsx     Hooks de React: usePlants, usePlant, useTimeline, useAnalyses,
                    useGuia, useFotosProgreso, useAttention, useRegistrarRiego...
    backup.ts       Exportar/importar copia (JSON + fotos en base64)
  ui/
    components/     Componentes reutilizables + tema (theme.css, index.css)
    screens/        Inicio, DetallePlanta, FormularioPlanta, Ajustes, navegación
  lib/              Fechas, ids, utilidades, redirección tras el 404 de Pages
public/
  manifest.webmanifest   Instalabilidad
  sw.js                  Service worker (cache-first en assets, network-first en navegaciones)
  404.html               Redirige los enlaces directos a la app (GitHub Pages no sabe de rutas)
  icons/                 PNG 192/512 (any + maskable) generados por scripts/generar-iconos.mjs
.github/workflows/
  deploy.yml             GitHub Actions: compila y publica en GitHub Pages
```

**Regla de oro:** la interfaz solo habla con la capa de datos a través de los hooks de `src/db/context.tsx`.
Nunca hables con Dexie ni con la API de Gemini desde un componente: si lo necesitas, pídelo en `src/services/contracts.ts`.

---

## La IA (Gemini, nivel gratuito)

1. Ve a <https://aistudio.google.com/apikey> con tu cuenta de Gmail.
2. **Create API key** → **Get started**. No hace falta tarjeta ni plan de pago.
3. Pégala en **Ajustes → Clave de la API** dentro de la app.

La clave se guarda **solo en tu móvil**. No está en el repositorio ni en el hosting.
Se usa para el análisis de foto, la guía de cuidados y la identificación de especie;
el resto de la app funciona sin internet.

El modelo recibe la foto **más** el contexto real de la planta (especie, maceta, luz,
último riego, días transcurridos, frecuencia objetivo y historial) para poder
responder "regar o no regar" con sentido. La comparación manda **dos** fotos en la
misma petición: la actual y la del análisis anterior.

---

## Publicar en GitHub Pages

1. Sube el repositorio a GitHub como **público**.
2. `Settings → Pages → Source` → **GitHub Actions**.
3. Cada `git push` a `main` pasa `npm run verify` y publica la app.
4. La URL será `https://<tu-usuario>.github.io/Plantapps/`.

> **Ojo con la capitalización:** `base` en `vite.config.ts` es `/Plantapps/` y el repo
> se llama `Plantapps`. Con minúsculas, GitHub Pages devuelve 404 y la app sale en blanco.

En el móvil: abrir la URL en Chrome → **Añadir a pantalla de inicio**.

---

## Acceso a GitHub

El push va **por SSH**, no por token. Ver la sección completa en `agents.md`
(clave `~/.ssh/id_ed25519_github`, declarada en `~/.ssh/config` para `github.com`).

Para consultar el estado de los despliegues no hace falta autenticación:
el repo es público y la API sin login basta para leer los runs.

---

## Copias de seguridad

Los datos son locales. Si borras los datos del navegador o desinstalas la PWA, los pierdes.
**Ajustes → Exportar copia** genera un archivo `.json` (incluidas las fotos) que puedes
guardar en Drive o WhatsApp. **Importar copia** los restaura, también las guías.

---

## Stack

Vite 8 · React 19 · TypeScript 6 (estricto) · Tailwind CSS 4 · Dexie 4 (IndexedDB) · Zod 4 · date-fns 4 · Vitest 5

Ver `agents.md` para la guía detallada de cómo contribuir.