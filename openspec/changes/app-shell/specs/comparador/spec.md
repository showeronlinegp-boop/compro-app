# Comparador Module Specification

## Purpose

Primer módulo del host. Dueño de todo el dominio de precios: estado ex-`AppShell` (interests, shopping, sync/enrich, promos, `profile` y código postal), carrito, onboarding, nav reactiva, slots y endpoints. Montado en `basePath: '/'`.

## Requirements

| # | Requisito | Fuerza |
|---|---|---|
| C1 | Manifest `AppModule` como única declaración | MUST |
| C2 | Nav reactiva decidida por el módulo | MUST |
| C3 | Redirección a onboarding sin cambios | MUST |
| C4 | `profile`/código postal y slots del header en el módulo | MUST |
| C5 | Polling sync/enrich sin cambios | MUST |
| C6 | Movimiento de archivos sin cambio de lógica | MUST |

### Requirement: C1 — Manifest único

El comparador MUST declarar en `modules/comparador/index.ts` sus rutas (`/`, `/intereses`, `/planner`, `/cart`, `/compare`, `/onboarding` con su `auth`), `Provider`, `useNav` y `slots`. Las páginas MUST conservar su API de props; los wrappers del módulo las alimentan desde el context.

#### Scenario: Rutas del manifest
- GIVEN el manifest del comparador
- WHEN se listan sus `routes`
- THEN coinciden en path y `auth` con la tabla de H1

### Requirement: C2 — Nav decidida por el módulo

`useNav()` MUST devolver Explorar, Intereses, Planner y, sólo si `profile.onboarding_done`, Comparar. Explorar MUST apuntar a la última `pathname+search` visitada de `/`. La variante top MUST mostrar contadores (`Intereses (n)`, `Planner (n)`, sólo con n > 0) y `📊 Comparar`; la bottom, ícono + label sin contador.

#### Scenario: Onboarding completo
- GIVEN `profile.onboarding_done = true`
- WHEN se renderiza la nav
- THEN ambas variantes incluyen Comparar → `/compare`

#### Scenario: Onboarding pendiente o profile no cargado
- GIVEN `profile` nulo u `onboarding_done = false`
- WHEN se renderiza la nav
- THEN ninguna variante incluye Comparar

#### Scenario: Contadores
- GIVEN 3 intereses y 0 items en shopping
- WHEN se renderiza la nav top
- THEN muestra `Intereses (3)` y `Planner` sin contador

#### Scenario: Explorar recuerda la búsqueda
- GIVEN el usuario estuvo en `/?q=leche`
- WHEN navega a `/planner`
- THEN el item Explorar apunta a `/?q=leche`

### Requirement: C3 — Redirección a onboarding

Al cargar `profile`, si `!onboarding_done`, `localStorage.onboarding_skipped !== '1'` y la ruta no es `/onboarding`, el módulo MUST navegar a `/onboarding` con `replace`. Completar onboarding MUST actualizar `profile` y navegar a `/planner`.

#### Scenario: Redirige
- GIVEN un profile con `onboarding_done = false` y sin flag de skip
- WHEN carga en `/intereses`
- THEN termina en `/onboarding` sin entrada nueva en el historial

#### Scenario: Skip respetado
- GIVEN `onboarding_skipped = '1'`
- WHEN carga cualquier ruta
- THEN no hay redirección

### Requirement: C4 — Profile y header del módulo

`profile`, `postal_code` y `LocationSelector` MUST vivir en el módulo. El carrito (badge), `LocationSelector` y `SyncPanel` MUST exponerse como `slots.headerActions`; `CartDrawer` como `slots.overlays`. `CartProvider` MUST componerse dentro de `ComparadorProvider`.

#### Scenario: Header equivalente
- GIVEN el host con el comparador registrado
- WHEN se renderiza el header
- THEN muestra marca (host), luego carrito, ubicación y sync (módulo), y al final la cuenta Clerk (host), como hoy

#### Scenario: Acción sin sesión
- GIVEN un usuario sin sesión en `/`
- WHEN agrega un interés
- THEN se lo redirige a `/sign-in`

### Requirement: C5 — Polling

Mientras sync o enrich corren, el módulo MUST consultar estado cada 3 s y MUST limpiar los timers al terminar o desmontar, sin duplicarlos bajo `StrictMode`.

#### Scenario: Cleanup
- GIVEN un sync en curso
- WHEN el Provider se desmonta
- THEN no quedan intervals activos

### Requirement: C6 — Movimiento con `git mv`

Los archivos de dominio MUST moverse a `frontend/src/modules/comparador/` en un commit previo, sólo con `git mv` y sin cambios de lógica, preservando la topología relativa (`pages/`, `components/`, `contexts/`, `types/`, `api.ts` en la raíz del módulo).

#### Scenario: Mocks siguen resolviendo
- GIVEN `pages/Cart.test.tsx` con `vi.mock('../api')` y `vi.mock('../contexts/CartContext')`
- WHEN corre `npm test` tras el move
- THEN pasa sin cambiar asserts

#### Scenario: Commit sólo de renombres
- GIVEN el commit de movimiento
- WHEN se inspecciona con `git show -M`
- THEN todas las entradas son renombres y las únicas líneas modificadas son especificadores de `import` (MAY, sólo si hacen falta para compilar)
