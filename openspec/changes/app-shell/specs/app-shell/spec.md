# App Shell (host) Specification

## Purpose

Infraestructura compartida del front: identidad (Clerk), layout, ruteo y nav generados desde un registry de módulos, y servicios globales (`resolveLocation`, `HostToolsOutlet`). El host NO conoce dominio.

## Requirements

| # | Requisito | Fuerza |
|---|---|---|
| H1 | No-regresión de rutas y auth | MUST |
| H2 | Rutas generadas sólo desde el registry (eager) | MUST |
| H3 | Nav top y bottom desde una sola lista | MUST |
| H4 | Providers de todos los módulos siempre montados | MUST |
| H5 | Aislamiento host → dominio | MUST |
| H6 | `resolveLocation` (pura) / `useHostLocation` (reactivo, con `navItem`) | MUST |
| H7 | `HostToolsOutlet` | MUST |
| H8 | Chrome por ruta (`'full'` / `'task'`) | MUST |

### Requirement: H1 — No-regresión de rutas y auth

El sistema MUST servir las mismas URLs con el mismo gating que hoy: `/sign-in/*`, `/sign-up/*` (Clerk, fuera del layout); `/` pública; `/intereses`, `/planner`, `/cart`, `/compare`, `/onboarding` con auth `required`. Una ruta no declarada MUST renderizar el layout con `<main>` vacío (igual que hoy).

#### Scenario: Ruta pública sin sesión
- GIVEN un usuario sin sesión
- WHEN navega a `/`
- THEN ve el header, la nav y Explorar, sin redirección

#### Scenario: Ruta protegida sin sesión
- GIVEN un usuario sin sesión
- WHEN navega a `/planner`
- THEN el host lo redirige al sign-in de Clerk

#### Scenario: Ruta protegida con sesión
- GIVEN un usuario con sesión
- WHEN navega a `/cart`
- THEN se renderiza la página del carrito dentro del layout

#### Scenario: Ruta desconocida
- GIVEN cualquier usuario
- WHEN navega a `/no-existe`
- THEN se renderiza el layout con el contenido principal vacío

### Requirement: H2 — Rutas generadas desde el registry

El host MUST generar `<Routes>` exclusivamente desde los `routes` de los módulos del registry, resolviendo `path` relativo a `basePath`. En este cambio las rutas MUST ser eager (sin `Suspense`/`lazy`); el contrato MUST aceptar componentes lazy para el futuro.

#### Scenario: Módulo de prueba agregado
- GIVEN un manifest de prueba con una ruta `/demo` y una línea nueva en el registry
- WHEN se monta el host en `/demo`
- THEN se renderiza el componente de esa ruta, sin tocar otros archivos del host

#### Scenario: Render síncrono
- GIVEN el smoke test actual de `App`
- WHEN se monta en `/`
- THEN el contenido está disponible sin esperar fallback de Suspense

### Requirement: H3 — Nav desde una sola fuente

El host MUST renderizar la nav top (`lg+`) y la bottom (`<lg`) a partir de la MISMA `NavItem[]` que entrega `useNav()` de cada módulo. El texto, íconos, destinos y estado activo renderizados MUST ser idénticos a los actuales. `NavItem.icon` MAY ser `string` (emoji, el caso actual) o `ReactNode` (p. ej. SVG); con `string` el render MUST ser idéntico al actual.

#### Scenario: Ambas variantes coinciden
- GIVEN un módulo cuyo `useNav()` devuelve N items
- WHEN se renderiza el layout
- THEN la nav superior y la "Navegación inferior" muestran los mismos N items, en el mismo orden y con los mismos `to`

#### Scenario: Módulo sin `useNav`
- GIVEN un módulo sin `useNav`
- WHEN se renderiza el layout
- THEN no aporta items y el host no falla

### Requirement: H4 — Providers siempre montados

El host MUST montar el `Provider` de TODOS los módulos del registry envolviendo el layout completo (header, main, overlays), independientemente de la ruta activa. Los slots `headerActions` y `overlays` MUST renderizarse dentro de esos providers.

#### Scenario: Estado preservado entre rutas
- GIVEN un estado de módulo cargado
- WHEN el usuario navega a una ruta pública o desconocida
- THEN el Provider sigue montado y su estado no se pierde

### Requirement: H5 — Aislamiento host → dominio

Ningún archivo bajo `frontend/src/host/` MUST importar de `frontend/src/modules/**`, salvo `host/registry.ts`. El host MUST manejar sólo identidad (Clerk: cuenta, `RequireAuth`, `AuthTokenBridge`, `http.ts`) y layout; `profile` y código postal NO son del host.

#### Scenario: Test de aislamiento
- GIVEN el árbol de `host/`
- WHEN un test analiza los imports
- THEN sólo `registry.ts` referencia `modules/`

#### Scenario: Violación detectada
- GIVEN un archivo de `host/` que importa `modules/comparador/api`
- WHEN corre el test
- THEN el test falla nombrando el archivo

### Requirement: H6 — resolveLocation / useHostLocation

`resolveLocation(pathname, modules)` MUST ser una función pura que devuelve `{ module, route, fullPath, params }` del patrón más específico entre las rutas de `modules` (mismo ranking que `<Routes>`), o `null` si no matchea. `resolveLocation` MUST NOT completar `navItem`, porque la nav es reactiva y no está disponible fuera de React.

`useHostLocation()` MUST resolver la ubicación actual (`useLocation().pathname`) contra el registry y MUST completar `navItem?` con el item del módulo resuelto, tomado de `NavItemsProvider`, cuyo `to` (sin search) matchea `fullPath`. Si ningún item matchea, `navItem` MUST quedar `undefined`. `useHostLocation()` MUST usarse sólo dentro del layout del host.

#### Scenario: Match específico
- GIVEN el registry con el comparador
- WHEN se llama `resolveLocation('/compare', [comparador])`
- THEN devuelve módulo `comparador` y la ruta `/compare`, sin `navItem`

#### Scenario: Más específico gana
- GIVEN módulos falsos con rutas `/demo` y `/demo/:id`
- WHEN se resuelve `/demo/7`
- THEN devuelve la ruta `/demo/:id` con `params.id = '7'`

#### Scenario: Sin match
- GIVEN el mismo registry
- WHEN se resuelve `/sign-in/factor-one` o `/no-existe`
- THEN devuelve `null`

#### Scenario: useHostLocation completa navItem
- GIVEN el layout montado en `/intereses` con un módulo cuyo `useNav()` incluye `intereses → /intereses`
- WHEN un componente dentro del layout llama `useHostLocation()`
- THEN recibe la ruta `/intereses` y `navItem.id === 'intereses'`

#### Scenario: useHostLocation sin item de nav
- GIVEN el layout montado en `/cart` y ningún `NavItem` apunta a `/cart`
- WHEN se llama `useHostLocation()`
- THEN recibe la ruta `/cart` con `navItem` `undefined`

### Requirement: H7 — HostToolsOutlet

El host MUST montar `<HostToolsOutlet/>`, que renderiza sólo las `HostTool` con `enabled: true`. En este cambio la lista MUST estar vacía y no agregar markup visible.

#### Scenario: Lista vacía
- GIVEN `hostTools = []`
- WHEN se renderiza el layout
- THEN el DOM es equivalente al actual

#### Scenario: Herramienta deshabilitada
- GIVEN una tool con `enabled: false`
- WHEN se renderiza el outlet
- THEN su componente no se monta

### Requirement: H8 — Chrome por ruta

`ModuleRoute` MUST aceptar un campo opcional `chrome?: 'full' | 'task'`; si se omite, vale `'full'`. El host MUST resolver el chrome de la ruta activa vía `useHostLocation()` (la misma resolución de H6); si la URL no matchea ninguna ruta, el chrome MUST ser `'full'`.

- `'full'` (pantalla "de lugar"): el layout MUST ser idéntico al actual.
- `'task'` (pantalla de tarea): el host MUST NOT renderizar la "Navegación inferior" (`BottomNav`) y `<main>` MUST NOT reservar el espacio inferior de esa barra. El header del host (marca, nav superior, `headerActions`, cuenta), los `overlays` y `<HostToolsOutlet/>` MUST seguir montados; los Providers (H4) no se ven afectados.

En este cambio ninguna ruta del comparador declara `chrome`, así que el comportamiento visible MUST NOT cambiar.

#### Scenario: Ruta de tarea oculta la barra inferior
- GIVEN un módulo falso con las rutas `/demo` (sin `chrome`) y `/demo/anotar` (`chrome: 'task'`)
- WHEN se monta el host en `/demo/anotar`
- THEN se renderiza el componente de la ruta, NO existe la nav "Navegación inferior", y el header del host sigue presente

#### Scenario: Herramientas del host en ruta de tarea
- GIVEN el mismo módulo falso y una `HostTool` habilitada
- WHEN se monta el host en `/demo/anotar`
- THEN el componente de la tool está montado

#### Scenario: Ruta sin chrome usa 'full'
- GIVEN el mismo módulo falso
- WHEN se monta el host en `/demo`
- THEN la nav "Navegación inferior" está presente, igual que hoy

#### Scenario: Volver de una tarea restaura la barra
- GIVEN el host montado en `/demo/anotar`
- WHEN el usuario navega a `/demo`
- THEN la "Navegación inferior" vuelve a renderizarse sin remontar los Providers

#### Scenario: Ruta desconocida usa 'full'
- GIVEN cualquier registry
- WHEN se navega a `/no-existe`
- THEN la "Navegación inferior" está presente (layout igual al actual)
