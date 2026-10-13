# Propuesta: app-shell — COMPRO como host con módulos

> Detalle de análisis y alternativas completas en `exploration.md`.

## Intención

`frontend/src/App.tsx` es shell y dominio a la vez: nav duplicada, estado del comparador en `AppShell`, `CartProvider` y widgets del dominio en el header global, `api.ts` mezclando infra y endpoints. Así no entra un segundo módulo sin tocar todo. Separamos un **host** (infra compartida) del **comparador**, que pasa a ser el primer módulo. **Refactor sin cambio de comportamiento.**

## Alcance

**Adentro**
- Contrato `AppModule` tipado + `registry` como única fuente de rutas, nav, providers y slots.
- Host: layout (header + bottom nav desde UNA lista), `RequireAuth`, rutas Clerk, `AuthTokenBridge`, `http.ts` (token + `req`), `resolveLocation` / `useHostLocation`, `HostToolsOutlet` vacío.
- Módulo `comparador`: manifest, `ComparadorProvider` (estado ex-`AppShell`, polling, redirección a onboarding), `useNav`, slots (`CartDrawer`, `LocationSelector`, `SyncPanel`), endpoints y tipos.
- Tests nuevos: registry → rutas/nav, `resolveLocation`, aislamiento host↛módulo.

**Afuera**
- Backend `/api/*`, cambios de URLs (el comparador sigue en `/`), launcher/selector de módulos, roles, segundo módulo, herramienta `test-notes`, rediseño visual.

## Enfoque

Manifest por módulo con rutas embebidas; el host genera `<Routes>` y nav.

```ts
// host/contract.ts
export interface AppModule {
  id: string;                       // 'comparador'
  label: string;
  basePath: string;                 // '/' (sin prefijo: URLs intactas)
  routes: ModuleRoute[];
  Provider?: ComponentType<{ children: ReactNode }>; // envuelve TODO el layout
  useNav?: () => NavItem[];          // hook: labels/visibilidad reactivos viven en el módulo
  slots?: { headerActions?: ComponentType; overlays?: ComponentType };
}
export interface ModuleRoute {
  path: string;                     // relativo a basePath
  component: LazyExoticComponent<ComponentType> | ComponentType;
  auth?: 'public' | 'required';     // 'required' → RequireAuth del host
  title?: string;                   // para resolveLocation
}
export interface NavItem { id: string; to: string; label: string; icon?: string; end?: boolean }
export function resolveLocation(pathname: string): { module: AppModule; route: ModuleRoute; navItem?: NavItem } | null;
export interface HostTool { id: string; enabled: boolean; Component: ComponentType }
```

- **Nav condicionada por onboarding**: `useNav()` del comparador lee `profile.onboarding_done` de su context y decide si incluye "Comparar"; también arma los contadores y el `to` recordado de Explorar. El host no sabe nada de eso.
- **`CartProvider`**: se compone dentro de `comparador.Provider`, que el host monta alrededor del layout completo (igual que hoy).
- **Páginas**: mantienen sus props; wrappers del módulo leen el context y las pasan.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Mapa declarativo estilo neggo | Doble registro de rutas + lógica de dominio en el shell |
| File-based routing | Dependencia y migración de router; igual hace falta manifest |
| Data router RR6 (`handle`) | Cambia `main.tsx` y smoke test; no resuelve providers/slots. Evolución posible a futuro |
| Estado por props del host / store externo | Host acoplado al dominio / dependencia nueva |

## Áreas afectadas

| Área | Impacto |
|---|---|
| `frontend/src/App.tsx` | Modificado (≈20 líneas) |
| `frontend/src/host/**` | Nuevo |
| `frontend/src/modules/comparador/**` | Nuevo (vía `git mv` de pages/components/contexts/types/supers/handoff) |
| `frontend/src/api.ts` | Partido en `host/http.ts` + `modules/comparador/api.ts` |
| Tests co-ubicados | Se mueven con su archivo; asserts sin cambios |

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| `vi.mock` relativos rotos al mover | Media | Preservar topología relativa dentro del módulo |
| Lazy cambia timing (smoke test, fallback) | — | Eliminado: rutas eager (decisión cerrada 1) |
| Redirección onboarding / polling se comportan distinto | Baja | Mover lógica tal cual; test de redirección |
| Host importa dominio | Media | Test de aislamiento sobre imports |

## Rollback

Todo vive en `refactor/app-shell`, sin backend ni DB. Commits separados (mover → extraer host → manifest). Si falla post-merge: `git revert` del squash commit. Durante el trabajo: revertir el commit de la fase rota.

## Criterios de éxito

- [ ] `npm run typecheck` y `npm test` (frontend) en verde, sin cambiar asserts existentes.
- [ ] URLs, nav (top y bottom, "Comparar" condicionado) y redirección a onboarding idénticas.
- [ ] Rutas y nav declaradas en UN solo lugar (manifest); `App.tsx` sin dominio.
- [ ] `host/` no importa de `modules/` salvo `registry.ts` (verificado por test).
- [ ] Un módulo de prueba se agrega con manifest + una línea en el registry (test).
- [ ] `resolveLocation` y `HostToolsOutlet` disponibles para `test-notes`.

## Decisiones cerradas

Cerradas por el usuario; reflejadas en `specs/app-shell` (H2, H4, H5) y `specs/comparador` (C4, C6).

| # | Decisión | Consecuencia |
|---|---|---|
| 1 | Rutas **eager** en este cambio (sin `Suspense`/`lazy`). El contrato acepta componentes lazy para el futuro. | Smoke test sin cambios de timing; desaparece el riesgo "lazy cambia timing". |
| 2 | Providers de **todos** los módulos **siempre montados**, envolviendo el layout completo (como hoy). | Estado del módulo no se pierde al navegar fuera de sus rutas. |
| 3 | `profile`, código postal y `LocationSelector` son del **comparador**. El host sólo maneja identidad (Clerk) y layout. | `LocationSelector` va en `slots.headerActions`; el host no expone `profile`. |
| 4 | Mover archivos a `frontend/src/modules/comparador/` **en este cambio**, en un commit previo de sólo `git mv` (sin lógica; sólo especificadores de `import` si hacen falta para compilar), antes del commit de refactor. Topología relativa preservada. | Los `vi.mock` relativos siguen resolviendo; review del PR separable por commit. |
