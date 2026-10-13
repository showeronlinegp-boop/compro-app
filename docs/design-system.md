# Guía de diseño — Neggo (mobile-first)

Sistema de diseño de **toda la app** (antes COMPRO): el host y cada módulo (comparador, fiado y los que vengan).
Toma como base el sistema del mockup de fiado (`DESIGN.md` de Neggo) y lo generaliza para que todos los módulos se vean y se usen igual.

**Plataforma:** PWA pensada para celular. Ancho de referencia 390 px, tiene que funcionar desde 320 px. En tablet o desktop el contenido se centra con un máximo de 480 px. **No hay layouts de escritorio** (dos columnas, sidebars, tablas anchas).
**Usuario:** dueño de un comercio, en el mostrador, con una mano y poco tiempo. Puede tener más de 50 años y poca experiencia con apps.

---

## 1. Principios (valen para todos los módulos)

1. **Un toque, una acción.** Lo frecuente de cada módulo está en su pantalla de inicio, a dos toques como máximo.
2. **Grande y legible.** Texto base de 16 px o más, objetivos táctiles de 44 px o más, montos enormes.
3. **El color tiene significado.** Cada color de acento pertenece a una semántica. Lo neutro (`--ink`) es la acción por defecto. Ver §2.1.
4. **Sin jerga.** Ni contable ni técnica: "te deben", "más barato en", "anotar". Nunca "saldo deudor", "SKU", "sincronizar hojas".
5. **Plano y sereno.** Fondo gris verdoso, tarjetas blancas, sin sombras, sin degradados, **sin emoji** (se usan íconos SVG).
6. **El número importante se lee primero.** En cada pantalla, el dato principal (deuda, precio, ahorro) es lo más grande.

---

## 2. Tokens

Los tokens viven como variables CSS en `frontend/src/index.css` y se exponen a Tailwind en `tailwind.config.ts`.
Los componentes usan **siempre** el token, nunca el hex ni la paleta default de Tailwind (`gray-*`, `indigo-*`).

### 2.1 Colores

**Base (compartida por todo)**

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#EEF1F0` | Fondo de la app |
| `--surface` | `#FFFFFF` | Tarjetas, listas, inputs, teclado |
| `--surface-muted` | `#F3F5F4` | Celdas de datos dentro de una tarjeta |
| `--ink` | `#15191B` | Texto principal, **acción primaria neutra**, bloque destacado oscuro |
| `--ink-muted` | `#4B5459` | Texto secundario, labels, fechas |
| `--ink-disabled` | `#6B7478` | Ítems inactivos de la barra inferior |
| `--line` | `#E3E8E7` | Separadores entre filas |
| `--border` | `#C3CBC9` | Borde de inputs y botones secundarios |
| `--border-strong` | `#D5DBDA` | Borde superior de la barra inferior |
| `--avatar` | `#E3E8E7` | Fondo de avatares y pastillas neutras |
| `--disabled` | `#9AA4A2` | Fondo de botón deshabilitado |
| `--on-dark-muted` | `#C9D2D0` | Texto chico sobre `--ink` |
| `--on-dark-body` | `#DCE3E1` | Texto de cuerpo sobre `--ink` |
| `--focus` | `#1B4FA8` | Anillo/borde de foco (mismo valor que `--pago`) |

**Estados (compartidos)**

| Token | Hex | Uso |
|---|---|---|
| `--ok` | `#1E6B45` | Confirmaciones, "Listo", "Recordado" |
| `--ok-bg` | `#DCEFE4` | Fondo del check de éxito |
| `--warn` / `--warn-strong` / `--warn-bg` | `#6B3A00` / `#8A4B00` / `#FFF1DC` | Avisos que informan sin bloquear |
| `--late` / `--late-bg` | `#8A2E0A` / `#FBE3D6` | Urgencia: atrasos, contadores de cobro |
| `--danger` | `#A1261B` | Errores y acciones destructivas (borrar, anular) |

**Semánticos por módulo** — se usan **solo** dentro de su módulo y con ese significado:

| Módulo | Token | Hex | Significado |
|---|---|---|---|
| Fiado | `--fiado` | `#B4430C` | Te deben más (anotar fiado) |
| Fiado | `--pago` | `#1B4FA8` | Te deben menos (registrar pago), links |
| Fiado | `--pago-hover` | `#133B80` | Pressed de links |
| Compartido | `--whatsapp` / `--whatsapp-bubble` | `#1E6B45` / `#DCF3E4` | Todo lo que abre WhatsApp |
| Comparador | `--super-vea`, `--super-carrefour`, `--super-dia`, `--super-masonline` | `#E30613`, `#004B93`, `#E20032`, `#FF6600` | **Identidad** del súper (punto, borde, etiqueta). Nunca fondo de botón ni texto largo. |

**Reglas de color**
- Todo texto cumple 4,5:1 sobre su fondo. Blanco sobre `--ink`, `--fiado`, `--pago`, `--whatsapp` pasa.
- La acción primaria de una pantalla que no es de fiado/pago va en `--ink` (botón oscuro). El índigo actual del comparador se reemplaza por `--ink` (botones) y `--focus` (foco).
- El color nunca es la única señal: fiado/pago llevan signo `+`/`−`; los súper llevan su nombre al lado del punto de color.
- Sin modo oscuro por ahora. Si se agrega, se redefinen los tokens y los componentes no cambian.

### 2.2 Tipografía

- **Archivo** (500, 600, 700, 800): títulos, montos y precios, botones principales, iniciales.
- **Atkinson Hyperlegible** (400, 700): todo lo demás. Está pensada para baja visión.

Se cargan en `frontend/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Atkinson+Hyperlegible:wght@400;700&display=swap" rel="stylesheet">
```

| Token | Familia | Tamaño / peso | Uso |
|---|---|---|---|
| `amount-xl` | Archivo | 42 / 800, tracking −0,5 | Total principal del inicio de un módulo |
| `amount-l` | Archivo | 44 / 800 | Monto que se está cargando |
| `amount-m` | Archivo | 38 / 800 | Saldo en ficha, total de carrito |
| `price` | Archivo | 20 / 800 | Precio en una tarjeta de producto |
| `title-l` | Archivo | 26 / 800 | Título de pantalla con barra inferior |
| `title-m` | Archivo | 22 / 800 | Título de pantalla de tarea (con flecha atrás) |
| `title-s` | Archivo | 19 / 700 | Título de sección |
| `button-l` | Archivo | 18–19 / 700 | Botones principales |
| `button-m` | Archivo | 16 / 700 | Botones de acción secundarios |
| `keypad` | Archivo | 22 / 600 | Teclado numérico |
| `body-l` | Atkinson | 17 / 400 | Inputs, confirmaciones, burbujas |
| `body` | Atkinson | 16 / 400–700 | Nombres en listas, filas |
| `body-s` | Atkinson | 15 / 400–700 | Apoyo, botones secundarios |
| `caption` | Atkinson | 14 / 400 | Fechas, labels, metadatos |
| `micro` | Atkinson | 12–13 / 700 | Etiquetas, barra inferior. **Nada por debajo de 12 px.** |

**Reglas**
- Ningún input con letra menor a 16 px (iOS hace zoom).
- Dinero siempre en Archivo y con formato argentino `$ 42.300`. Se formatea con **una sola** función compartida (`frontend/src/host/ui/format.ts → formatMoney`, y `formatSignedMoney` para `+`/`−`), nunca a mano. Los precios con centavos del comparador muestran decimales solo si existen: `$ 1.249,90`.
- Interlineado 1,35–1,45 en textos de varias líneas.
- Las clases `text-xs`/`text-[11px]` que hoy usa el comparador quedan prohibidas: el mínimo es `micro` (12 px).

### 2.3 Espaciado, radios y tamaños

Base 4 px.

| Token | Valor | Uso |
|---|---|---|
| `gutter` | 16 px | Margen lateral de toda pantalla |
| `stack-screen` | 20 px | Entre bloques de una pantalla |
| `stack-section` | 10 px | Entre título de sección y su contenido |
| `card-padding` | 20 px | Tarjetas grandes |
| `row-padding` | 12 × 14 px | Filas de lista |
| `radius-xl` | 20 px | Tarjetas grandes |
| `radius-l` | 16 px | Listas, botones principales |
| `radius-m` | 12 px | Inputs, botones secundarios, avisos, celdas, teclas |
| `radius-pill` | 999 px | Avatares, etiquetas, filtros |
| `touch-min` | 44 px | Alto mínimo de todo lo tocable |
| `nav-height` | 74 px | Barra inferior |

Alturas de botón: 76 (acciones de inicio), 60 (confirmar), 58 (WhatsApp), 52–54 (secundarios, teclas), 48 (filas de buscador), 44 (chicos), 40 (filtros).

### 2.4 Íconos

SVG inline propios, 22–24 px, `stroke="currentColor"`, grosor 2–2,6, puntas redondeadas, `aria-hidden="true"`. Se centralizan en `frontend/src/host/ui/icons.tsx`. Set base: Más, Check, Atrás, Inicio, Clientes, Ajustes, Mensaje (paths en el `DESIGN.md` de fiado), más Buscar, Carrito, Comparar y Cerrar para el comparador. Botones de solo ícono llevan `aria-label`.

---

## 3. Layout mobile (lo provee el host)

```
┌──────────────────────────┐
│ safe-area top            │
│ ┌──────────────────────┐ │
│ │ <main> scroll        │ │  padding 24/16 (16 arriba en pantallas de tarea)
│ │                      │ │
│ └──────────────────────┘ │
│ Toast (si hay)           │  90 px sobre el borde con barra, 20 px sin barra
│ ┌──────────────────────┐ │
│ │ Barra inferior 74 px │ │  solo en pantallas "de lugar"
│ └──────────────────────┘ │
│ safe-area bottom         │
└──────────────────────────┘
```

- Raíz: `height: 100dvh` (no `100vh`), `max-width: 480px`, centrada, `flex-direction: column`, `overflow: hidden`.
- `main`: `flex: 1; overflow-y: auto`. Es el **único** contenedor que scrollea.
- Meta tags en `index.html`: `viewport-fit=cover`, `theme-color #EEF1F0`, `lang="es"`.
- **Pantallas de lugar** (inicio de módulo, listas, ficha, ajustes) muestran la barra inferior.
- **Pantallas de tarea** (anotar, confirmar, crear, comparar un carrito) la ocultan: el usuario termina o vuelve.
- **Nada de** `TwoColumn`, `sm:`/`lg:` para cambiar el layout, drawers laterales ni popovers anclados. Lo que hoy es drawer o popover pasa a ser una pantalla o una hoja inferior (bottom sheet) de ancho completo.

### 3.1 Navegación entre módulos

La barra inferior muestra **solo los ítems del módulo activo**: los 3 primeros de su `useNav`, más un cuarto ítem fijo del host, **"Más"** (`/mas`, constantes `MAX_BOTTOM_ITEMS` y `HOST_MORE_PATH` en `host/contract.ts`). La pantalla "Más" lista, en este orden: los ítems del módulo que no entraron en la barra, el cambio de herramienta (solo con más de un módulo) y la cuenta (Clerk). El módulo activo es el de la ruta actual; en `/mas` o en una ruta desconocida se mantiene el último visitado.

**Barra superior:** no hay header global. Si un módulo declara `slots.headerActions`, el host muestra en **sus** rutas una barra compacta de 56 px (marca "Neggo" + acciones + cuenta). Un módulo sin `headerActions` (como Fiado) pone en cada pantalla su `ScreenHeader`.

Al volver se regresa a la pantalla de origen (si se entró a "Anotar" desde la ficha, se vuelve a la ficha). La flecha atrás de `ScreenHeader` usa el historial y, si se entró directo por un link (sin historial dentro de la app), va a la ruta `backTo`. El hook `useGoBack(backTo)` hace lo mismo para botones propios.

---

## 4. Componentes compartidos (`frontend/src/host/ui/`)

Primitivas sin dominio, usadas por todos los módulos. Un módulo **no** redefine botones ni inputs propios. Los módulos importan de `host/ui/*`; el host nunca importa de `modules/` (lo controla `host/isolation.test.ts`).

Estado: ✅ disponible · ⏳ llega con el PR que la usa por primera vez.

| Componente | Notas |
|---|---|
| `Button` ✅ | Variantes: `primary` (`--ink`), `fiado`, `pago`, `whatsapp`, `outline` (borde `--ink`), `soft` (borde `--border`), `text`, `on-dark`. Tamaños `xl` 76, `l` 60, `m` 52, `s` 44, `chip` 40. Siempre `<button>`; pressed `brightness(0.92)`; disabled `--disabled`. |
| `Card` ✅ | `--surface`, `radius-xl`, padding 20. Variante `dark` (`--ink`), una sola por pantalla. Junto con `Section` (título `title-s` + contenido). |
| `List` + `ListRow` ✅ | Lista blanca `radius-l`; fila entera es un `<button>` (y `action` va al lado, nunca anidado), separador `--line`, slot izquierda (avatar/imagen), centro (título + secundaria), derecha (monto/acción). |
| `Avatar` ✅ | Círculo 40 (56 en ficha), inicial en Archivo. |
| `Pill` ✅ | Neutra, `warn`, `late`, `ok`. `micro`/`caption` 700. |
| `FilterChips` ✅ | Pastillas 40 px con `aria-pressed`, se envuelven en varias líneas (no scroll horizontal). |
| `TextField` ✅ | Label siempre visible arriba, alto 50–52, texto 17, foco borde 2 px `--focus`. `inputmode` correcto (`tel`, `search`). |
| `Keypad` ✅ | 3 × 4 (`1-9`, `00`, `0`, `⌫`), teclas 54 px. Para montos nunca se usa `<input type="number">`. |
| `ScreenHeader` ✅ | Variante `place` (título `title-l` + acción a la derecha) y `task` (flecha atrás 44 × 44 + `title-m`, color opcional). |
| `BottomNav` ✅ (del host) | Ícono 24 + texto 13/700; activo `--ink`, inactivo `--ink-disabled`. |
| `Toast` ✅ (`useToast()`) | `--ink`, texto blanco, `role="status"`, 3 s, acción opcional ("Deshacer"). |
| `Notice` ✅ | Aviso `--warn-bg` que informa y no bloquea. |
| Marca de corrección ✅ (en `FilaMovimiento` de Fiado) | Movimiento corregido: monto tachado + pastilla neutra "Corregido"; la corrección se muestra como fila propia con fecha y hora. Nunca se oculta. |
| `EmptyNote` ✅ | Una frase en `body-s` muted dentro de la misma tarjeta o lista. Sin ilustraciones ni emoji. (`EmptyState`, el de pantalla completa, queda para el comparador hasta su migración.) |
| `BottomSheet` ⏳ (migración del comparador) | Hoja inferior de ancho completo, para lo que hoy son modales/drawers (`FreqModal`, `CartDrawer`). |
| `TextArea` ✅ | Mismas reglas que `TextField`, para textos largos (plantillas). |
| `DataCells` ✅ | Grilla de 2–3 celdas `--surface-muted` con label `micro` y valor `body-s` 700. |
| `WhatsAppBubble` ✅ | Vista previa del mensaje, termina en "Hecho con Neggo". |

Los componentes con dominio (fila de cliente, tarjeta de producto, selector de cliente) viven **dentro del módulo** y se arman con estas primitivas.

---

## 5. Textos y tono

- Voseo rioplatense y frases cortas: "Buscá por nombre", "Anotaste $ 4.200 de fiado a Marta.", "En DIA te sale $ 3.100 menos."
- Botones con verbo: "Anotar fiado", "Comparar", "Agregar", "Guardar cliente".
- Estados vacíos y errores dicen qué hacer: "No pudimos cargar los precios. Probá de nuevo."
- Sin mayúsculas sostenidas salvo el sobretítulo de la tarjeta oscura.

---

## 6. Accesibilidad

- Elementos reales: `<button>`, `<a href>`, `<input>` con `<label>`. Nada de `div` con `onClick`.
- Táctil 44 × 44 o más; contraste 4,5:1; `aria-label` en botones de solo ícono; `aria-pressed` en filtros; `role="status"` en toasts.
- Foco visible con `--focus` (reemplaza `FOCUS_RING` índigo de `styles.ts`).
- `prefers-reduced-motion` ya está respetado en `index.css`; se mantiene.

---

## 7. Implementación en el código

1. **Tokens:** bloque `:root { … }` en `frontend/src/index.css` con todas las variables de §2.
2. **Tailwind:** `theme.screens` está **vacío**: no existen `sm:`/`md:`/`lg:`, porque la app vive en una columna de 480 px y un breakpoint por ancho de viewport no describe ese espacio. `theme.extend` mapea los tokens (`colors: { bg: 'var(--bg)', ink: { DEFAULT: 'var(--ink)', muted: 'var(--ink-muted)' }, fiado: 'var(--fiado)', … }`, `fontFamily: { display, body }`, `borderRadius`, `fontSize` con los tokens de §2.2). Así se escribe `bg-surface text-ink rounded-xl text-body-l` y no hex sueltos.
3. **Primitivas:** `frontend/src/host/ui/*` con tests de Testing Library (rol, `aria-*`, variantes). Estado presionado con la clase utilitaria `pressable`.
4. **Shell:** `host/HostLayout.tsx` renderiza la raíz `100dvh` de 480 px, la barra superior opcional, `main` (el único que scrollea), overlays, `BottomNav` del módulo activo y la región del toast. PWA: `public/manifest.webmanifest` + `public/icon.svg`, sin service worker (offline es etapa 2).
5. **Lint de diseño (barato):** `host/ui/design-lint.test.ts` falla si en el código del host aparece la paleta default de Tailwind (`gray-`, `indigo-`, …), sombras, degradados, texto menor a 12 px, breakpoints, emoji o hex sueltos en clases. Cada módulo migrado o nuevo suma su carpeta al escaneo; el comparador entra cuando se migre.

### 7.1 Migración del comparador

El comparador hoy es desktop-first (índigo, grises de Tailwind, emoji, `shadow-xl`, `TwoColumn`, drawer y popovers). Se migra en un change separado, pantalla por pantalla, sin cambiar comportamiento: primero Explorar y Carrito (las más usadas), después Planner, Intereses, Onboarding y Compare.

---

## 8. Checklist para cada pantalla nueva

- [ ] El dato o la acción principal es lo más grande de la pantalla.
- [ ] Todo lo tocable mide 44 px o más.
- [ ] Ningún texto menor a 12 px ni input menor a 16 px.
- [ ] Solo tokens; colores semánticos usados con su significado.
- [ ] Sin emoji, sin sombras, sin degradados.
- [ ] Voseo, sin jerga.
- [ ] Funciona en 320 px sin scroll horizontal.
- [ ] Estado vacío y estado de error escritos.
- [ ] Se puede volver a la pantalla de origen.
