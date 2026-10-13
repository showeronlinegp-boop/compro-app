# Exploración: app-shell (host con módulos)

## Estado actual

**Front** (`frontend/src`, plano por tipo: `pages/`, `components/`, `contexts/`, `types/`):

- `main.tsx`: `ClerkProvider` → `BrowserRouter` → `App`. Es infraestructura pura y está bien.
- `App.tsx` (520 líneas) hace TODO a la vez:
  - **Infra**: `AuthTokenBridge`, rutas `/sign-in/*` `/sign-up/*`, `RequireAuth`, layout (header sticky, `<main>`, bottom nav móvil), botón de cuenta Clerk (`UserButton` / `SignInButton`).
  - **Dominio comparador**: `CartProvider` envolviendo `/*` (el header usa `useCart()` para el badge del carrito), `CartDrawer`, `LocationSelector` (lee/escribe `profile.postal_code`), `SyncPanel` inline (supers, progreso de sync).
  - **Estado de dominio en `AppShell`**: `interests`, `shopping`, `syncStatus`, `enrichStatus` + `enrichDone` (banner transitorio con `useRef` + `setTimeout`), `promos`, `profile`. Polling cada 3 s mientras sync/enrich corren. Acciones `toggleInterest` y `addToShopping` (redirigen a `/sign-in` si no hay sesión).
  - **Redirección de onboarding**: al cargar `profile`, si `!onboarding_done` y no está `localStorage.onboarding_skipped`, `navigate('/onboarding', {replace})`.
  - **Nav duplicada**: el array de items se arma DOS veces (top `lg+` y `BottomNav` `<lg`), con labels dinámicos (`Intereses (n)`, `Planner (n)`), item "Comparar" condicionado a `profile.onboarding_done`, y "Explorar" apuntando a `explorarTo.current` (recuerda el query string de `/`).
  - Props hacia páginas: `Explorar` recibe 7 props, `Intereses` 4, `Onboarding` un `onComplete` que hace `setProfile` + `navigate('/planner')`.
- `api.ts` (150 líneas): infra (`BASE`, `setTokenGetter`, `authHeaders`, `req`, `reqOptional`) + objeto `api` con endpoints del dominio (`products`, `interests`, `shopping`, `profile`, `sync`, `enrich`, `promos`, `cart`). `types/api.ts` (352 líneas) es 100% dominio.
- Links absolutos hardcodeados dentro de páginas del dominio: `CartDrawer` (`/cart`, `/`), `Cart` (`/`), `Compare` (`/planner`), `Intereses` (`/`), `Onboarding` (`/planner`, `/`), `Planner` (`/intereses`, `/compare`). **Implicancia**: el comparador tiene que seguir montado en la raíz (`/`) para no cambiar comportamiento; un prefijo tipo `/precios/*` es otro cambio.
- `styles.ts` (`FOCUS_RING`, `PRIMARY_CTA`) es UI compartida; `supers.ts` y `handoff.ts` son dominio.

**Tests front** (Vitest + jsdom + Testing Library, co-ubicados):

- `test/App.smoke.test.tsx`: monta `<App/>` en `MemoryRouter`, mockea Clerk y `fetch`; sólo asserta `textContent !== ''` (síncrono).
- `pages/Cart.test.tsx` mockea `'../contexts/CartContext'` y `'../api'`; `pages/Compare.test.tsx` y `contexts/CartContext.test.tsx` mockean `'../api'`. **Los `vi.mock` usan paths relativos**: si se mueven archivos hay que preservar la topología relativa (o actualizar los mocks a la par).
- Las páginas se testean importándolas directo, no a través de `App` → mover rutas a lazy no rompe esos tests.

**CI**: `.github/workflows/ci.yml` corre `typecheck` + `test` en front y back.

**Referencia neggo** (`neggo-app-pruebas/frontend/src/shell/modules.js`): mapa `MODULES → subs → tabs` con `roles`, helpers `visibleModules`, `resolveLocation(pathname)` (gana el match más largo, con `DETAIL_TITLES` por prefijo). Defectos confirmados: las rutas viven en `modules.js` **y** en `App.jsx` (sincronizadas por test con regex), y `avisos.js` tiene `switch (moduleId)` → el shell conoce el dominio de cada módulo. Lo bueno a rescatar: `resolveLocation` como servicio del shell, consumido por herramientas globales (`TestNotes.jsx`, `ComoSeHace.jsx`).

## Áreas afectadas

- `frontend/src/App.tsx` — se reduce a componer el host.
- `frontend/src/api.ts` — se parte: infra HTTP/token al host, endpoints al módulo.
- `frontend/src/types/api.ts`, `pages/*`, `components/*` (salvo layout/compartidos), `contexts/CartContext.tsx`, `supers.ts`, `handoff.ts` — pasan al módulo comparador.
- `frontend/src/components/AuthTokenBridge.tsx`, `styles.ts`, `components/layout/*`, `components/EmptyState.tsx` — host / UI compartida.
- `frontend/src/test/App.smoke.test.tsx` — puede necesitar esperar (`findBy*`) si las rutas pasan a lazy.
- Tests co-ubicados con `vi.mock` relativos — se mueven junto con sus archivos.
- `backend/` — fuera de alcance.

## Enfoques

### Eje 1 — Cómo se declara un módulo

| # | Enfoque | Pros | Contras | Esfuerzo |
|---|---------|------|---------|----------|
| A | **Mapa declarativo estilo neggo** (nav en un archivo, rutas en `App.tsx`) | Conocido, simple de leer | Doble registro de rutas → drift; test de sincronía frágil (regex); badges terminan en el shell con `switch` | Bajo |
| B | **Manifest tipado por módulo con rutas embebidas** (`AppModule` con `routes` lazy + `useNav` + `Provider` + `slots`), registry en el host que genera `<Routes>` y nav | UNA fuente de verdad; TS valida el contrato; el host no conoce dominio; `resolveLocation` sale gratis del registry; no suma dependencias | Hay que diseñar bien el contrato (nav reactiva, providers); algo de boilerplate | Medio |
| C | **File-based routing** (vite-plugin-pages, TanStack Router, RR7 framework mode) | Rutas por convención de carpetas | Dependencia nueva + migración del router; nav/providers/slots igual necesitan manifest; demasiado para un refactor sin cambio de comportamiento | Alto |
| D | **Data router de RR6** (`createBrowserRouter` + `handle` en cada ruta para metadata de nav) | `useMatches()` da la ubicación nativa; loaders a futuro | Cambia `main.tsx` y el smoke test (hoy envuelve `App` en `MemoryRouter`); `handle` no resuelve providers ni slots; mezcla dos migraciones | Medio-Alto |

### Eje 2 — Dónde vive el estado del dominio

| Enfoque | Pros | Contras |
|---------|------|---------|
| **Context del módulo** (`ComparadorProvider` con interests/shopping/sync/enrich/promos/profile + acciones; las rutas usan wrappers que leen el context y pasan las props actuales a las páginas) | El host queda ciego al dominio; páginas y sus tests no cambian su API de props; patrón ya usado (`CartContext`) | Un context grande re-renderiza consumidores; mitigable partiendo state/dispatch como `CartContext` |
| Props desde el host (como hoy) | Cero cambios en páginas | El host tiene que conocer el dominio → mata el objetivo |
| Store externo (Zustand, etc.) | Selectores finos | Dependencia nueva, cambio de paradigma, fuera del espíritu "refactor puro" |

### Eje 3 — Nav reactiva (labels con contadores, item condicionado por onboarding, Explorar que recuerda la búsqueda)

- **Recomendado**: el módulo expone un hook `useNav(): NavItem[]` que el host invoca DENTRO del provider del módulo (un componente `<ModuleNav module={m} />` por módulo, así respetamos las reglas de hooks). La lógica `onboarding_done → mostrar Comparar` y `explorarTo` queda en el módulo. El host sólo renderiza `NavItem[]` en dos variantes visuales (top y bottom) desde UNA lista.
- Alternativa: items estáticos + `badge`/`visible` como funciones puras sobre un "estado del shell" → reintroduce el `switch` de neggo o obliga al host a conocer el estado. Descartado.

### Eje 4 — Providers y slots del header

- `CartProvider` hoy envuelve header + main + drawer. Para no cambiar comportamiento, el `Provider` del módulo tiene que envolver **todo el layout** (no sólo las rutas del módulo). Con N módulos: composición de todos los providers alrededor del layout (siempre montados) vs. sólo el del módulo activo (pierde estado al cambiar de módulo; cambia el comportamiento de carga). Con un único módulo ambas dan lo mismo; el contrato debería permitir decidir después.
- Slots: `headerActions` (carrito, `LocationSelector`, `SyncPanel`) y `overlays` (`CartDrawer`). Cuenta Clerk y marca "COMPRO" quedan en el host.

### Eje 5 — Herramientas globales del host (para `test-notes`)

- Exponer `resolveLocation(pathname) → { module, route, navItem } | null` (usando `matchPath` de react-router sobre el registry, gana el patrón más específico) y un hook `useHostLocation()`.
- Punto de montaje `<HostToolsOutlet/>` alimentado por un array `hostTools` con `enabled` (p.ej. `import.meta.env.DEV && import.meta.env.VITE_TEST_NOTES === '1'`). En este cambio queda vacío.

## Recomendación

**Enfoque B + Context del módulo + `useNav` hook + providers compuestos alrededor del layout**, con el comparador montado en la raíz (`basePath: '/'`). Estructura destino:

```
frontend/src/
├── main.tsx                       (sin cambios)
├── App.tsx                        (≈20 líneas: <AuthTokenBridge/> + <HostApp registry={modules}/>)
├── host/                          (infra; NO importa de modules/* salvo registry.ts)
│   ├── contract.ts                AppModule, ModuleRoute, NavItem, HostTool
│   ├── registry.ts                lista de módulos (único lugar que importa módulos)
│   ├── HostApp.tsx / Layout.tsx   Routes generadas, header, bottom nav, slots, Suspense
│   ├── RequireAuth.tsx, AuthTokenBridge.tsx
│   ├── location.ts                resolveLocation + useHostLocation
│   ├── tools.ts                   HostToolsOutlet (vacío por ahora)
│   ├── http.ts                    req, reqOptional, setTokenGetter
│   └── ui/                        styles.ts, layout/*, EmptyState
└── modules/comparador/
    ├── index.ts                   manifest AppModule
    ├── ComparadorProvider.tsx     estado ex-AppShell + redirección onboarding
    ├── api.ts, types/api.ts       endpoints sobre host/http
    ├── pages/, components/, contexts/   (misma topología relativa → los vi.mock siguen andando)
    └── supers.ts, handoff.ts, SyncPanel.tsx
```

Mover con `git mv` preservando la topología relativa minimiza cambios en tests (los `vi.mock('../api')` siguen resolviendo porque `api.ts` queda en la raíz del módulo).

## Riesgos

- **Rutas lazy vs smoke test**: con `React.lazy` el contenido de la ruta llega async; el header sigue siendo síncrono, así que el assert actual probablemente pasa, pero conviene un `findBy*` explícito. Además cambia sutilmente la UX (fallback de Suspense) → ¿es "cambio de comportamiento"? Decisión abierta.
- **Orden de efectos**: la redirección a `/onboarding` hoy vive en `AppShell` bajo `CartProvider`; moverla al `ComparadorProvider` tiene que mantener `location.pathname !== '/onboarding'` y el flag de `localStorage`.
- **`StrictMode` y polling**: mover los `setInterval` al provider no debe duplicar timers (hoy ya se limpian, mantener el cleanup).
- **Re-renders**: un context único con todo el estado puede re-renderizar Explorar en cada tick de polling (hoy ya pasa vía props; no empeora, pero tampoco mejora).
- **Imports cruzados**: un `import` del host hacia `modules/comparador` fuera de `registry.ts` rompe el aislamiento; conviene un test/regla que lo detecte.
- **Diff grande de `git mv`**: revisión del PR pesada; mitigable con commits separados (mover sin tocar contenido / refactor).

## Listo para propuesta

Sí. Decisiones para validar con el usuario: (1) rutas lazy en este cambio o eager con soporte lazy en el contrato; (2) providers de todos los módulos siempre montados vs sólo el activo; (3) `profile` (código postal) como estado del host o del módulo; (4) mover archivos a `modules/comparador/` ahora o en un cambio aparte.
