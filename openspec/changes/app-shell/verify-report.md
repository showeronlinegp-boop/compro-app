# Verification Report — app-shell

**Change**: app-shell (COMPRO como host con módulos)
**Rama**: `refactor/app-shell` (sin push)
**Fecha**: 2026-10-13
**Veredicto**: ✅ **PASS WITH WARNINGS**: 0 CRITICAL, 3 WARNING, 4 SUGGESTION

---

## Completeness

| Métrica | Valor |
|---|---|
| Tareas totales | 28 |
| Completas | 26 |
| Incompletas | 2 (manuales 🖐, no bloqueantes) |

Pendientes del usuario (requieren navegador, `npm run dev`):

- [ ] 4.7 🖐 Nav top/bottom: textos, íconos, contadores, activo, Comparar condicionado; orden del header; barra inferior en todas las rutas del comparador.
- [ ] 4.8 🖐 Usuario nuevo sin skip → `/onboarding` sin historial; completar → `/planner`; `/planner` sin sesión → sign-in.

Los dos tienen cobertura automática parcial (ver matriz): redirect con `replace` y back que saltea la ruta (C3), orden del header y top = bottom con el comparador real (C4, H3), `/planner` sin sesión (H1). Lo que falta es lo visual (clases activas, breakpoints `lg`) y el flujo real de Clerk.

---

## Build & Tests

| Chequeo | Comando | Resultado |
|---|---|---|
| Typecheck frontend | `cd frontend && npm run typecheck` | ✅ exit 0 |
| Tests frontend | `cd frontend && npm test` | ✅ **18 files / 145 passed**, 0 failed, 0 skipped (corrido 2 veces, determinista) |
| Typecheck backend | `cd backend && npm run typecheck` | ✅ exit 0 |
| Diff backend | `git diff --stat main...HEAD -- backend` | ✅ vacío (backend sin cambios) |
| Build | — | ➖ no se corre por regla (`build_command: ""`) |
| Coverage | — | ➖ no configurado (`coverage_threshold: 0`) |

Evolución de tests: 66 (base) → 113 (commit 3, +47 host) → 142 (commit 5, +29 comparador) → 145 (verify, +3 integración host + comparador real).

Sin cambios respecto de `main`: `test/App.smoke.test.tsx`, `main.tsx`, `index.css`, `package.json`, `vitest.config.ts`, `.github/`.

---

## Spec Compliance Matrix

### App Shell (host)

| Req | Escenario | Test | Resultado |
|---|---|---|---|
| H1 | Ruta pública sin sesión | `ComparadorProvider.test.tsx > host + comparador > H1: "/" sin sesión muestra header, nav y Explorar, sin redirección` | ✅ COMPLIANT |
| H1 | Ruta protegida sin sesión | `HostApp.test.tsx > H1: ruta required sin sesión → RedirectToSignIn` + `ComparadorProvider.test.tsx > H1: "/planner" sin sesión → sign-in de Clerk` | ✅ COMPLIANT |
| H1 | Ruta protegida con sesión | `HostApp.test.tsx > H1: ruta required con sesión → renderiza la página dentro del layout` + `manifest.test.ts > declara exactamente las rutas de H1` (`/cart` required) | ✅ COMPLIANT |
| H1 | Ruta desconocida | `HostApp.test.tsx > H1: ruta desconocida → layout con main vacío` | ✅ COMPLIANT |
| H1 | (sign-in/sign-up fuera del layout) | `HostApp.test.tsx > H1: las rutas de Clerk quedan fuera del layout` | ✅ COMPLIANT |
| H2 | Módulo de prueba agregado | `HostApp.test.tsx > H2: monta la ruta de un módulo falso en /demo` | ✅ COMPLIANT |
| H2 | Render síncrono | `App.smoke.test.tsx > mounts without throwing` (sin cambios, sin `await`) + `routing.test.ts > isLazyComponent` | ✅ COMPLIANT |
| H3 | Ambas variantes coinciden | `HostApp.test.tsx > H3: top y bottom muestran los mismos items…` + `ComparadorProvider.test.tsx > host + comparador: top y "Navegación inferior" con los mismos items y Comparar` | ✅ COMPLIANT |
| H3 | Módulo sin `useNav` | `HostApp.test.tsx > H3: un módulo sin useNav no aporta items y no rompe` | ✅ COMPLIANT |
| H3 | (texto idéntico / ícono `ReactNode`) | `labels.test.ts` (6 tests, incluye `'Intereses '`) + `HostApp.test.tsx > H3: texto top con topLabel y bottom con ícono + label…` | ⚠️ PARTIAL: texto y markup cubiertos; clases/estado activo sólo por la comparación de `innerHTML` del commit 4 (no commiteada) y la 🖐 4.7 |
| H4 | Estado preservado entre rutas | `HostApp.test.tsx > H8 … volver de /demo/anotar a /demo restaura la barra sin remontar el Provider` + `H4: los slots se renderizan dentro del Provider del módulo` | ⚠️ PARTIAL: se prueba que no se remonta navegando entre rutas del módulo, no explícitamente hacia una ruta desconocida (estructuralmente es el mismo árbol: `ModuleProviders` envuelve `/*`) |
| H5 | Test de aislamiento | `isolation.test.ts > ningún archivo de host/ (salvo registry.ts) importa de modules/` (+ escanea árbol real) | ✅ COMPLIANT |
| H5 | Violación detectada | `isolation.test.ts > detecta una violación y nombra el archivo` (+ dinámico/side-effect) | ✅ COMPLIANT |
| H6 | Match específico | `manifest.test.ts > '/compare' → módulo comparador, ruta compare, sin navItem` | ✅ COMPLIANT |
| H6 | Más específico gana | `location.test.ts > el patrón más específico gana: /demo/7 → /demo/:id con params` | ✅ COMPLIANT |
| H6 | Sin match | `location.test.ts > /sign-in/factor-one → null`, `/no-existe → null` + `manifest.test.ts` (3 casos con el comparador real) | ✅ COMPLIANT |
| H6 | useHostLocation completa navItem | `HostApp.test.tsx > H6: useHostLocation completa navItem…` | ✅ COMPLIANT |
| H6 | useHostLocation sin item de nav | `HostApp.test.tsx > H6: useHostLocation sin item de nav → navItem undefined` | ✅ COMPLIANT |
| H7 | Lista vacía | `tools.test.tsx > la lista del host está vacía…`, `con la lista vacía no agrega markup` + `HostApp.test.tsx > H7` | ✅ COMPLIANT |
| H7 | Herramienta deshabilitada | `tools.test.tsx > una tool deshabilitada no se monta` | ✅ COMPLIANT |
| H8 | Ruta de tarea oculta la barra inferior | `HostApp.test.tsx > H8 … en /demo/anotar ('task') no hay barra inferior, el header sigue…` | ✅ COMPLIANT |
| H8 | Herramientas del host en ruta de tarea | idem (`…y la tool está montada`) | ✅ COMPLIANT |
| H8 | Ruta sin chrome usa 'full' | `HostApp.test.tsx > H8 … en /demo (sin chrome) la barra está y main reserva su espacio` + `location.test.ts > chromeOf` | ✅ COMPLIANT |
| H8 | Volver de una tarea restaura la barra | `HostApp.test.tsx > H8 … volver de /demo/anotar a /demo restaura la barra sin remontar el Provider` | ✅ COMPLIANT |
| H8 | Ruta desconocida usa 'full' | `HostApp.test.tsx > H8 … en /no-existe la barra está (full)` | ✅ COMPLIANT |

### Comparador

| Req | Escenario | Test | Resultado |
|---|---|---|---|
| C1 | Rutas del manifest | `manifest.test.ts > declara exactamente las rutas de H1, en orden y con su auth` (+ Provider/useNav/slots, ids únicos, sin `chrome`) | ✅ COMPLIANT |
| C2 | Onboarding completo | `ComparadorProvider.test.tsx > con onboarding_done incluye 📊 Comparar → /compare al final` + integración top = bottom | ✅ COMPLIANT |
| C2 | Onboarding pendiente o profile no cargado | `ComparadorProvider.test.tsx > sin Comparar con onboarding pendiente (skip) o profile sin cargar (sin sesión)` | ✅ COMPLIANT |
| C2 | Contadores | `ComparadorProvider.test.tsx > contadores: 3 intereses y 0 en shopping…` + `contador de Planner con items en shopping` | ✅ COMPLIANT |
| C2 | Explorar recuerda la búsqueda | `ComparadorProvider.test.tsx > Explorar recuerda la búsqueda: de /?q=leche a /planner apunta a /?q=leche` | ✅ COMPLIANT |
| C3 | Redirige | `ComparadorProvider.test.tsx > profile sin onboarding y sin skip → /onboarding con replace…` (`useNavigationType() === 'REPLACE'` y `navigate(-1)` saltea `/intereses`) + `profile null … también redirige` | ✅ COMPLIANT |
| C3 | Skip respetado | `ComparadorProvider.test.tsx > respeta localStorage.onboarding_skipped = '1'` | ✅ COMPLIANT |
| C3 | (ya en /onboarding, completar → /planner) | `ya en /onboarding no navega`; completar → `/planner` sólo en código (`routes.tsx > OnboardingRoute`) | ⚠️ PARTIAL: "completar → `/planner`" queda para la 🖐 4.8 |
| C4 | Header equivalente | `ComparadorProvider.test.tsx > host + comparador > C4: header en orden marca, carrito, ubicación, sync y cuenta` | ✅ COMPLIANT |
| C4 | Acción sin sesión | `ComparadorProvider.test.tsx > toggleInterest sin sesión → /sign-in sin llamar a la API` (+ `addToShopping`) | ✅ COMPLIANT |
| C5 | Cleanup | `ComparadorProvider.test.tsx > desmontar con sync y enrich corriendo no deja timers` (`vi.getTimerCount() === 0`) + `StrictMode no duplica los intervals` + interval de 3 s exacto + banner de 8 s | ✅ COMPLIANT |
| C6 | Mocks siguen resolviendo | `pages/Cart.test.tsx`, `pages/Compare.test.tsx`, `contexts/CartContext.test.tsx` verdes sin cambios de asserts | ✅ COMPLIANT |
| C6 | Commit sólo de renombres | `git show -M fcd1956`: todo rename + `App.tsx` M; las líneas `+/-` del front son sólo especificadores de import (las únicas no-import son de `state.yaml`) | ✅ COMPLIANT (verificado con git, no con test) |

**Resumen**: 35 escenarios de spec + 3 sub-chequeos = 38 filas: 35 ✅ COMPLIANT, 3 ⚠️ PARTIAL, 0 ❌.

---

## Coherencia con el design

| Decisión | ¿Se siguió? | Nota |
|---|---|---|
| Estructura final (`host/*`, `modules/comparador/*`) | ✅ | El árbol real coincide con el diagrama; no quedan `src/components`, `src/pages` ni `src/contexts` |
| Commit de movimiento con `git mv` + especificadores | ✅ | `fcd1956` |
| `host/http.ts` (BASE privado, `setTokenGetter`, `req`, `reqOptional`) | ✅ | `1f88fe6` |
| Rutas eager; el contrato acepta lazy | ✅ | `routeElement` envuelve en `Suspense` sólo si es lazy |
| Providers siempre montados (`ModuleProviders`) | ✅ | |
| Chrome por ruta (H8) declarativo | ✅ | `chromeOf(useHostLocation())` en `HostLayout` |
| `NavItem.icon: string \| ReactNode` (brecha #7) | ✅ | |
| Clerk directo en el módulo (sin fachada) | ✅ | |
| Aislamiento por test Vitest (no Biome) | ✅ | `import.meta.glob ?raw` |
| Sin alias `@host/*` | ✅ | rutas relativas |
| Manifest en `modules/comparador/index.ts` | ✅ | |

Desvíos menores ya registrados en `state.yaml` (todos válidos, no rompen el contrato): `HostApp`/`HostLayout`/`HostToolsOutlet` aceptan `tools?` opcional (default `hostTools`) para inyectar una tool habilitada en tests; `useHostLocation` toma los módulos de `NavItemsProvider`; helper `useNavItems()`; el context expone `explorarTo` como `MutableRefObject`.

---

## Issues

### CRITICAL

Ninguno.

### WARNING

1. **Verificación manual pendiente (4.7 / 4.8)**: estilos activos, breakpoints `lg`, flujo real de Clerk y "completar onboarding → `/planner`" sólo los puede confirmar el usuario en el navegador. No bloquea el merge según lo acordado, pero hay que hacerlo antes del PR.
2. **Timeout de 8 s del banner de enrich sin cleanup al desmontar**: preexistente, copiado literal de `AppShell` (C5 pide "sin cambios"). Si el Provider se desmonta con el banner visible queda 1 `setTimeout` colgado, que después hace un `setState` sobre un componente desmontado (no-op en React 18, sin warning). En la app real el Provider nunca se desmonta (H4). No se tocó para no cambiar comportamiento en un refactor. Fix sugerido en un cambio aparte: guardar los ids en un ref y limpiarlos en un efecto de cleanup.
3. **Equivalencia visual de nav/header (H3) sin test commiteado**: la comparación de `innerHTML` viejo contra nuevo (28/28 idénticos) se hizo en el commit 4 con un test temporal que no quedó en el repo. Los tests commiteados cubren texto, orden, `to` y markup de íconos, pero no las clases CSS.

### SUGGESTION

1. Activar los future flags de React Router v7 (`v7_startTransition`, `v7_relativeSplatPath`) en un cambio aparte: hoy ensucian el stderr de los tests.
2. `SyncPanel.tsx` quedó literal y Biome sugiere 2 cambios de formato. CI no corre lint; conviene un `chore` de formato.
3. Convertir el test de equivalencia de `innerHTML` en un snapshot liviano de la nav, o hacerlo durante `feat/design-system`, cuando el markup va a cambiar a propósito.
4. H4 hacia una ruta desconocida: se puede sumar un caso explícito en `HostApp.test.tsx` (`/demo` → `/no-existe` → `providerMounts` sigue en 1).

---

## Chequeo de mutación (no commiteado)

En `ComparadorProvider.tsx` se probaron 3 mutaciones: sacar `replace` del redirect, reemplazar el primer `clearInterval` por un cleanup vacío y cambiar 8000 por 9000. Fallaron 5 tests y el archivo se restauró con `git status` limpio, así que los tests de C3 y C5 detectan regresiones reales.

## Bugs encontrados en el refactor

Ninguno. El único hallazgo (WARNING 2) es preexistente.
