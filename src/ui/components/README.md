# Sistema de diseño — `src/ui/components`

Todo se importa desde aquí: `import { Button, Card, Sheet } from '@/ui/components'`.

**Reglas de la app** (para que todas las pantallas se sientan la misma):

- Móvil primero, ancho máximo `max-w-md` centrado, listas de una columna.
- Nada pulsable baja de **44 px** de alto (`.tap-target`). Botones principales abajo, cerca del pulgar.
- Textos de 16 px o más, contraste alto, modo claro y oscuro con la clase `dark` en `<html>`.
- Colores del semáforo: `ok` (verde), `alerta` (ámbar), `peligro` (rojo), `marca` (verde planta), `neutro` (gris).
- Las acciones destructivas siempre pasan por `<ConfirmDialog destructive>`.

---

## Tabla de componentes

| Componente | Props | Ejemplo mínimo |
|---|---|---|
| `Card` | `children` · `className?` · `as?: 'div' \| 'section' \| 'li'` | `<Card as="li" className="mb-2">Monstera</Card>` |
| `Button` | `children` · `variant?: 'primary'\|'secondary'\|'ghost'\|'danger'` · `size?: 'sm'\|'md'\|'lg'` · `type?: 'button'\|'submit'` · `onClick?` · `disabled?` · `loading?` · `fullWidth?` · `className?` | `<Button variant="primary" size="lg" fullWidth loading={guardando} onClick={guardar}>Guardar</Button>` |
| `Badge` | `children` · `tone?: 'ok'\|'alerta'\|'peligro'\|'neutro'\|'marca'` · `className?` | `<Badge tone="ok">En casa</Badge>` |
| `EstadoRiegoChip` | `estado: EstadoRiego` · `diasParaRiego?: number \| null` | `<EstadoRiegoChip estado={estado} diasParaRiego={-3} />` |
| `VeredictoChip` | `veredicto: Veredicto` · `className?` | `<VeredictoChip veredicto={analisis.veredicto} />` |
| `PhotoThumb` | `photoId: ID \| undefined` · `alt: string` · `className?` · `size?: 'sm'\|'md'\|'lg'` | `<PhotoThumb photoId={planta.fotoPortadaId} alt={`Foto de ${planta.nombre}`} size="lg" />` |
| `EmptyState` | `icono: ReactNode` · `title: string` · `description?: string` · `action?: ReactNode` · `className?` | `<EmptyState icono="🪴" title="Sin plantas" description="Añade la primera." action={<Button onClick={nueva}>Añadir</Button>} />` |
| `Field` | `label: string` · `hint?: string` · `error?: string` · `required?: boolean` · `children: ReactNode` · `htmlFor?: string` · `className?` | `<Field label="Nombre" required error={error}><TextInput value={nombre} onChange={…} /></Field>` |
| `TextInput` | todas las de `<input>` + `className?` | `<TextInput placeholder="Monstera" value={v} onChange={…} />` |
| `TextArea` | todas las de `<textarea>` + `className?` (3 filas por defecto) | `<TextArea placeholder="Notas" value={n} onChange={…} />` |
| `Select` | `options: Array<{ value: string; label: string }>` + nativas + `className?` | `<Select options={[{ value: 'sol_directo', label: 'Sol directo' }]} value={luz} onChange={…} />` |
| `DateInput` | `value?: string` (`YYYY-MM-DD`) + nativas + `className?` | `<DateInput value={fecha} onChange={…} />` |
| `Sheet` | `open: boolean` · `onClose: () => void` · `title: string` · `children: ReactNode` · `footer?: ReactNode` | `<Sheet open={abierto} onClose={cerrar} title="Editar" footer={<Button onClick={guardar}>Guardar</Button>}>…</Sheet>` |
| `Spinner` | `size?: 'sm'\|'md'\|'lg'` · `label?: string` · `className?` | `{cargando ? <Spinner label="Cargando plantas" /> : lista}` |
| `SegmentedControl` | `value: T` · `options: Array<{ value: T; label: string }>` · `onChange: (v: T) => void` · `ariaLabel: string` · `className?` | `<SegmentedControl value={vista} options={[{ value: 'lista', label: 'Lista' }, { value: 'cal', label: 'Calendario' }]} onChange={setVista} ariaLabel="Vista" />` |
| `ErrorBanner` | `title: string` · `message?: string` · `onRetry?: () => void` · `onDismiss?: () => void` | `<ErrorBanner title="No se ha podido guardar" onRetry={reintentar} />` |
| `ConfirmDialog` | `open` · `title` · `message` · `confirmLabel` · `cancelLabel` · `onConfirm` · `onCancel` · `destructive?` | `<ConfirmDialog open={borrar} title="¿Borrar?" message="Se borra también el historial." confirmLabel="Sí, borrar" cancelLabel="Cancelar" onConfirm={borrar} onCancel={() => setBorrar(false)} destructive />` |
| `Acordeon` | `titulo: ReactNode` · `children: ReactNode` · `contador?: ReactNode` · `abierto?: boolean` · `onToggle?: (abierto: boolean) => void` · `tono?: 'neutro'\|'ok'\|'alerta'\|'peligro'` · `etiqueta?: string` · `className?` | `<Acordeon titulo="Necesitan agua" contador={<Badge tone="alerta">3</Badge>} tono="alerta" abierto={abierto} onToggle={setAbierto}>…</Acordeon>` |

---

## Detalles que conviene no esquecer

- **Button**: con `loading` se deshabilita solo y pone `aria-busy`. Los tres tamaños respetan 44 px (`sm` 44 · `md` 48 · `lg` 56).
- **Sheet**: se cierra con la ✕, con `Escape` y tocando fuera; bloquea el scroll del fondo, atrapa el `Tab` y devuelve el foco al botón que la abrió. El `footer` es fijo y respeta la zona segura inferior.
- **ConfirmDialog** es un `Sheet`: tocar fuera o `Escape` cuenta como cancelar.
- **Field** conecta solo la etiqueta, la ayuda y el error con el control que lleva dentro (inyecta `id`, `aria-describedby`, `aria-invalid` y `aria-required`). No hace falta pasar ids.
- **DateInput** habla `YYYY-MM-DD`: usa `todayIso()` y `toIsoDate()` / `fromDateInputValue()` de `@/lib/dates`.
- **PhotoThumb** usa `usePhotoUrl` de `@/db/context`, así que **necesita `<DbProvider>`** (ya está en `main.tsx`). El `alt` es obligatorio: describe la foto, p. ej. `Foto de la Monstera del salón`.
- **EstadoRiegoChip / VeredictoChip** no piden texto: usan `ESTADO_REGIO_LABELS` y `VEREDICTO_LABELS` de `@/types` y eligen el color solos.
- **Acordeon**: toda la cabecera es un `<button>` de 44 px (`.tap-target`), así que se abre con el pulgar, con Enter y con Espacio. El botón lleva `aria-expanded` + `aria-controls` y el panel es un `role="region"` etiquetado por el propio botón. Sin `abierto` se despliega solo; con `abierto` + `onToggle` manda el padre. El contenido no hace scroll propio: empuja al resto de la pantalla. `tono` tiñe la cabecera y pone la franja de color a la izquierda (`ok`, `alerta`, `peligro`, `neutro`). El chevron es un SVG inline con `aria-hidden`, y gira con `rotate-180` respetando `prefers-reduced-motion`.
- Las clases del tema (`campo`, `superficie`, `tap-target`, `area-segura-abajo`) están en `src/ui/theme.css`; las utilidades de Tailwind mandan sobre ellas, así que `className` siempre gana.
