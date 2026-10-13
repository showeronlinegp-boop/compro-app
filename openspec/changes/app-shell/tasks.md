# Tasks: app-shell — COMPRO como host con módulos

> `V` = `cd frontend && npm run typecheck && npm test` (verde al cerrar cada tarea y cada commit; las que no lo dicen también se validan con `V`). Sin build. 🖐 = verificación manual en navegador (`npm run dev`).

## Commit 1 — `refactor(frontend): mover dominio a modules/comparador y UI compartida a host` (C6)

- [x] 1.1 `git mv` de dominio según el mapa del design: `api.ts`, `types/`, `supers*`, `handoff*`, `lib/zone.ts`, `contexts/CartContext*`, `pages/{Cart,Compare,Explorar,Intereses,Onboarding,Planner}*`, `components/*` de dominio (+`compare/`, `onboarding/`) → `src/modules/comparador/` (C6)
- [x] 1.2 `git mv` de host: `AuthTokenBridge`, `SignInPage`, `SignUpPage` → `host/auth/`; `styles.ts`, `EmptyState*` → `host/ui/`; `components/layout/*` → `host/ui/layout/` (C6, H5)
- [x] 1.3 Ajustar SÓLO especificadores en `App.tsx`, `host/auth/AuthTokenBridge.tsx`, `pages/*`, `components/{CartDrawer,PromoPanel,compare/CompareView}` (`vi.mock` no se tocan) (C6). Verif: `V`
- [x] 1.4 Commit y verificar: `git show -M --stat HEAD` = renames + `App.tsx` M; `git show -M HEAD | rg '^[+-][^+-]' | rg -v "from '|import\('"` vacío (C6 "Commit sólo de renombres")

## Commit 2 — `refactor(frontend): extraer núcleo HTTP a host/http` (H5)

- [x] 2.1 Crear `host/http.ts` (BASE, `setTokenGetter`, `req`, `reqOptional`) extraído de `modules/comparador/api.ts`; el módulo importa de `../../host/http` (H5). Verif: `V`
- [x] 2.2 `host/auth/AuthTokenBridge.tsx` importa `setTokenGetter` de `../http` (cierra la violación transitoria) (H5). Verif: `V`

## Commit 3 — `refactor(frontend): contrato AppModule y HostApp genérico` (`App.tsx` sin cambios)

- [x] 3.1 `host/contract.ts`: `AppModule`, `ModuleRoute`, `NavItem` (con `icon?: string | ReactNode`, brecha #7), `HostTool`, `ResolvedLocation` (H2, H3)
- [x] 3.2 `host/routing.tsx`: `joinPath`, `flattenRoutes`, `isLazyComponent`, `routeElement`, `ModuleRoutes` (H1, H2)
- [x] 3.3 `host/auth/RequireAuth.tsx` y `host/auth/AccountMenu.tsx` copiados literal de `App.tsx` (H1, H5)
- [x] 3.4 `host/nav/{NavItemsProvider,TopNav,BottomNav,labels}.tsx|ts` con clases `NavLink` textuales; `topLabel` concatena el ícono sólo si es `string`; `TopNav` (con `iconInTop`) renderiza un ícono no-`string` en `<span aria-hidden>` antes del texto (H3)
- [x] 3.5 `host/location.ts`: `resolveLocation(pathname, modules)` pura con `matchRoutes`; `useHostLocation` completa `navItem` (H6)
- [x] 3.6 `host/tools.tsx`: `hostTools = []`, `HostToolsOutlet` → `null` si vacío (H7)
- [x] 3.7 `host/ModuleProviders.tsx`, `host/HostLayout.tsx`, `host/HostApp.tsx` (`modules` por props) (H1, H4). Verif: `V`
- [x] 3.8 Tests unit: `nav/labels.test.ts` (incluye `'Intereses '` y un ícono no-`string` que no se concatena), `routing.test.ts` (`joinPath`), `location.test.ts` (específico, `null`), `tools.test.tsx` (vacío / deshabilitada) (H3, H6, H7). Verif: `V`
- [x] 3.9 `HostApp.test.tsx` con módulos falsos: `/demo` (H2), sin `useNav` (H3), top = bottom `to` (H3), `required` + `SignedOut` → `RedirectToSignIn` (H1), slot lee Provider (H4), `/no-existe` → `main` vacío (H1), `useHostLocation` con/sin `navItem` (H6). Verif: `V`
- [x] 3.10 `host/isolation.test.ts`: `findViolations` + árbol real `[]` + caso sintético `['x.ts']` (H5). Verif: `V`
- [x] 3.11 Chrome por ruta: `RouteChrome` + `ModuleRoute.chrome?` en `contract.ts`; `chromeOf(loc)` en `location.ts` (`null`/omitido → `'full'`); `HostLayout` con `'task'` no renderiza la nav "Navegación inferior" y `<main>` pasa de `flex-1 pb-16 lg:pb-0` a `flex-1`; header, overlays y `HostToolsOutlet` siguen montados (H8). Verif: `V`
- [x] 3.12 Tests H8: `location.test.ts` suma `chromeOf` (`null`, sin campo, `'task'`); `HostApp.test.tsx` con módulo falso `/demo` + `/demo/anotar` (`chrome: 'task'`): en `/demo/anotar` no hay "Navegación inferior", el header sigue y una `HostTool` habilitada está montada; en `/demo` y `/no-existe` la barra está; navegar de `/demo/anotar` a `/demo` la restaura sin remontar el Provider (H8). Verif: `V`

## Commit 4 — `refactor(frontend): comparador como módulo del host`

- [x] 4.1 `modules/comparador/ComparadorProvider.tsx`: estado, refs, efectos y acciones literales de `AppShell` + `useComparador()` (C3, C4, C5)
- [x] 4.2 `modules/comparador/useNav.ts` (Comparar condicionado, badges, `explorarTo`) (C2)
- [x] 4.3 `modules/comparador/routes.tsx`: `ExplorarRoute`, `InteresesRoute`, `OnboardingRoute` (C1, C3)
- [x] 4.4 `components/{HeaderActions,CartButton,SyncPanel,LocationSlot}.tsx` (C4)
- [x] 4.5 `modules/comparador/index.ts` (manifest) + `host/registry.ts` (C1, H2)
- [x] 4.6 `App.tsx` reducido a `<AuthTokenBridge/>` + `<HostApp modules={registry}/>`; borrar `AppShell`, `SyncPanel`, `RequireAuth` (H1, H5). Verif: `V` (smoke sin cambios)
- [ ] 4.7 🖐 Nav top (`lg+`) y bottom (`<lg`): textos, íconos, contadores, activo, Comparar condicionado; header en orden marca/carrito/ubicación/sync/cuenta; la barra inferior aparece en TODAS las rutas del comparador (ninguna declara `chrome`) (H3, H8, C2, C4)
- [ ] 4.8 🖐 Usuario nuevo sin skip → redirige a `/onboarding` sin historial; completar → `/planner`; `/planner` sin sesión → sign-in (C3, H1)

## Commit 5 — `test(frontend): cobertura de ComparadorProvider y manifest`

- [ ] 5.1 `modules/comparador/manifest.test.ts`: paths + `auth` vs H1; `resolveLocation('/compare', [comparador])` (C1, H6). Verif: `V`
- [ ] 5.2 `ComparadorProvider.test.tsx`: redirect con `replace`, skip, ya en `/onboarding` (C3); Comparar y contadores, `?q=` (C2); acción sin sesión → `/sign-in` (C4); fake timers + unmount → `vi.getTimerCount() === 0` (C5). Verif: `V`
