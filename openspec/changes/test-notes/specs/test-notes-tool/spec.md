# Test Notes Tool (frontend) Specification

## Purpose

Herramienta global del host para anotar errores, mejoras y dudas mientras se prueba la app, marcando el elemento en pantalla. Existe solo en desarrollo local y no conoce el dominio de ningún módulo.

## Requirements

| # | Requisito | Fuerza |
|---|---|---|
| T1 | Gate de build y sesión | MUST |
| T2 | Disponible en todas las rutas del layout | MUST |
| T3 | Marcar en pantalla | MUST |
| T4 | Selector estable y descripción | MUST |
| T5 | Crear nota con contexto | MUST |
| T6 | Pines | MUST |
| T7 | Panel: filtros, acciones, ir a la nota | MUST |
| T8 | Captura de contexto técnico | MUST |
| T9 | Aislamiento de `devtools/` | MUST |
| T10 | Estilo del design-system y layout del host | MUST |

### Requirement: T1 — Gate de build y sesión

La tool MUST incluirse solo si `import.meta.env.DEV` es verdadero y `VITE_TEST_NOTES === '1'`. En un build de producción el código de la tool MUST NOT estar en ningún archivo de `dist/`. Sin sesión de Clerk MUST NOT renderizar UI (decisión P3).

#### Scenario: Flag apagada
- GIVEN `VITE_TEST_NOTES` sin definir
- WHEN se monta el host
- THEN `hostTools` está vacío y no hay elementos `[data-test-notes]`

#### Scenario: Build de producción
- GIVEN `vite build` con `VITE_TEST_NOTES=1`
- WHEN se busca `test-notes` en `dist/`
- THEN no hay coincidencias

#### Scenario: Sin sesión
- GIVEN la flag activa y un usuario sin sesión
- WHEN se monta la tool
- THEN no se muestran los botones

### Requirement: T2 — Disponible en todo el layout

Con la flag activa y sesión, los botones "Marcar" y "Notas" MUST verse en toda ruta del layout del host (incluida `/mas`), con chrome `'full'` o `'task'`, dentro de la columna de la app, sin tapar la barra inferior (`nav[aria-label="Navegación inferior"]`) ni la región de toasts (`[data-testid="toast-region"]`) con un toast visible.

#### Scenario: Ruta de tarea
- GIVEN una ruta con `chrome: 'task'`
- WHEN se renderiza
- THEN los botones "Marcar" y "Notas" están presentes

#### Scenario: Toast visible
- GIVEN una ruta con chrome `'full'` y un toast con acción visible
- WHEN se renderizan los botones
- THEN su borde inferior queda por encima del borde superior del toast y de la barra inferior

### Requirement: T3 — Marcar en pantalla

"Marcar" MUST abrir una capa que cubre la columna de la app (header, `main` y barra inferior) e intercepta puntero y clic (la app debajo no reacciona), resalta el elemento bajo el puntero ignorando la UI propia (`data-test-notes`) y muestra "Tocá donde está el problema" con "Cancelar (Esc)". El clic MUST cerrar la capa y abrir el borrador con la marca (selector, elemento, coordenadas, ancho de viewport). `Esc` o "Cancelar" MUST salir sin marca.

#### Scenario: Clic sobre un botón de la app
- GIVEN el modo marcar activo sobre un botón con `aria-label="Agregar"`
- WHEN el usuario hace clic
- THEN el botón no recibe el clic y el borrador dice `Marcado: Botón: "Agregar"`

#### Scenario: Escape
- GIVEN el modo marcar activo
- WHEN se presiona `Escape`
- THEN la capa desaparece y no hay borrador nuevo

### Requirement: T4 — Selector estable y descripción

El selector MUST preferir, en orden: `[data-testid="…"]`, `#id` usable (empieza con letra, sin 3+ dígitos seguidos), `tag[aria-label="…"]` si es único en el documento, y si no `tag:nth-of-type(n)` por nivel hasta un ancestro anclado o `body`. La descripción MUST usar `aria-label`, `placeholder`, `title`, `alt` o texto (espacios colapsados, máx. 80 con `…`) con nombre legible del tag.

#### Scenario: data-testid gana
- GIVEN un elemento con `data-testid="cart-total"` e `id="total"`
- WHEN se construye el selector
- THEN es `[data-testid="cart-total"]`

#### Scenario: Id generado
- GIVEN un botón dentro de `div#r-83921` sin otras anclas
- WHEN se construye el selector
- THEN no usa ese id y termina en el path desde `body`

### Requirement: T5 — Crear nota con contexto

Guardar MUST enviar `tipo`, `texto`, `modo`, la marca (si hay), `ruta` = pathname actual, `pantalla` = `"<módulo> › <título de ruta>"` tomado de la ubicación resuelta del host (`useActiveModule().location`), nunca de la etiqueta del ítem de nav (si no resuelve: `Más` para `/mas`, `Inicio` para `/`, si no el pathname) y `contexto` (viewport, userAgent, errores y API capturados). Texto vacío MUST deshabilitar "Guardar nota". `Ctrl/Cmd+Enter` MUST guardar. Tras guardar, la nota MUST aparecer primera y enfocada; un error MUST mostrarse en el panel sin perder el borrador.

#### Scenario: Nota sin marcar
- GIVEN el panel abierto en `/cart`
- WHEN el usuario elige "Nota sin marcar", escribe y guarda
- THEN se envía `ruta: '/cart'` sin `selector` y la nota aparece en la lista

### Requirement: T6 — Pines

Cada nota viva de la ruta actual con marca MUST mostrar un pin con su `#id` junto al elemento (por selector) o, si no se encuentra, en la posición guardada con opacidad reducida y aviso "posición aproximada". Los pines MUST seguir el scroll de `main` (único contenedor que scrollea; de la ventana si no hay `main`) y el resize, y MUST NOT dibujarse si su posición cae fuera de la zona visible de `main` (no se superponen al header ni a la barra inferior). La posición aproximada se guarda relativa al contenido de `main` (`pos_y`) y a su ancho (`pos_x`). Clic en un pin MUST abrir el panel enfocando esa nota. Durante el marcado los pines MUST ocultarse.

#### Scenario: Elemento desaparecido
- GIVEN una nota cuyo selector ya no matchea y que tiene coordenadas
- WHEN se renderizan los pines
- THEN el pin aparece con aviso de posición aproximada

#### Scenario: Elemento scrolleado fuera de vista
- GIVEN una nota cuyo elemento quedó por debajo del borde inferior visible de `main`
- WHEN se renderizan los pines
- THEN no hay pin para esa nota hasta que el elemento vuelva a la zona visible

### Requirement: T7 — Panel

El panel MUST ser una hoja inferior de ancho completo dentro de la columna (sin drawer lateral) y MUST mostrar pantalla actual y total pendiente, filtros con contador (Pendientes = `abierta|en_curso|consulta`; Para revisar; Corregidas; Descartadas) y "Solo esta pantalla" (activo por defecto). Acciones por estado: `para_revisar` → Confirmar (`corregida`) / Sigue mal (`abierta`); `abierta|en_curso|consulta` → Descartar y checklist de modo editable; `corregida|descartada` → Reabrir; siempre Borrar con confirmación. Cada tarjeta MUST mostrar el autor (`autor`), porque las notas son compartidas entre cuentas (P1). La respuesta de Claude MUST verse como "Pregunta de Claude" en `consulta` y "Respuesta de Claude" en otros estados. "Ir a la nota" MUST navegar a su ruta y llevar la vista al pin. El panel MUST recargar cada 60 s.

#### Scenario: Confirmar corrección
- GIVEN una nota `para_revisar`
- WHEN el usuario toca "Confirmar"
- THEN la nota pasa a `corregida` y sale del filtro "Para revisar"

#### Scenario: Borrado con confirmación
- GIVEN una nota
- WHEN toca "Borrar" y luego "No"
- THEN la nota sigue en la lista

### Requirement: T8 — Captura de contexto

Con la tool cargada, MUST registrarse (idempotente) los últimos 15 `console.error`, errores no capturados y promesas rechazadas, y las últimas 15 llamadas a `/api/` con status no-ok o sin respuesta (método, url sin origen, status, `error` del cuerpo JSON). Las llamadas de la propia tool MUST excluirse mediante un parámetro de configuración, no un literal dentro de la captura. El comportamiento original de `console.error` y `fetch` MUST preservarse.

#### Scenario: API fallida
- GIVEN la captura instalada
- WHEN `fetch('/api/cart')` responde 500 con `{ error: 'x' }`
- THEN el snapshot incluye `{ metodo: 'GET', url: '/api/cart', status: 500, error: 'x' }` y el llamador recibe la misma respuesta

#### Scenario: Llamada propia excluida
- GIVEN la captura con exclusión de `/api/test-notes`
- WHEN `/api/test-notes` responde 400
- THEN no se registra

### Requirement: T9 — Aislamiento de `devtools/`

`src/devtools/**` MUST NOT importar de `src/modules/**`. Fuera de `devtools/`, solo `src/host/tools.tsx` MAY importar de `src/devtools/**`.

#### Scenario: Import prohibido
- GIVEN un archivo de `modules/` que importa de `devtools/`
- WHEN corre el test de aislamiento
- THEN falla nombrando el archivo

### Requirement: T10 — Estilo del design-system y layout del host

La UI de la tool MUST usar solo tokens del design-system (`docs/design-system.md`: `bg-surface`, `text-ink`, `border-line`, `bg-danger`, `text-micro`, …) y `FOCUS_RING*` de `host/ui/styles.ts`; MUST NOT usar paleta default de Tailwind, sombras, degradados, breakpoints, emoji, hex sueltos ni texto menor a 12 px. `src/devtools/**` (sin tests) MUST estar dentro del escaneo de `host/ui/design-lint.test.ts`. La tool MUST montarse dentro de la columna del host (no en un portal a `body`).

#### Scenario: Lint de diseño
- GIVEN un archivo de `src/devtools/test-notes/` con `className="shadow-lg"`
- WHEN corre `design-lint.test.ts`
- THEN falla nombrando el archivo y la regla "sombras"

#### Scenario: Montaje en la columna
- GIVEN la tool montada en `HostApp`
- WHEN se busca `[data-test-notes]`
- THEN su elemento padre es el mismo que el de `main`
