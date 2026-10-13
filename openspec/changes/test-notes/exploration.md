# Exploración: test-notes (notas de prueba con "Marcar en pantalla")

## Estado actual

**Origen (neggo, `C:\Users\USER\neggo-app-pruebas\`)**

| Pieza | Qué hace | Observaciones |
|---|---|---|
| `frontend/src/shell/TestNotes.jsx` (614 líneas) | Portal en `body` con `data-test-notes`: FABs "Marcar" y "Notas (n)", capa crosshair `fixed inset-0` que intercepta `pointermove`/`click`, highlight con `document.elementsFromPoint` excluyendo la UI propia, pines numerados `position:absolute` (reposicionados por selector o, si no está el elemento, por coordenadas `pos_x` fracción de `scrollWidth` + `pos_y` px absolutos), contorno de la nota enfocada y del borrador, panel lateral (borrador con tipo/texto/checklist de modo, filtros por grupo de estados, "solo esta pantalla", lista con acciones Confirmar/Sigue mal/Descartar/Reabrir/Borrar con confirmación, "Ir a la nota"), polling cada 60 s, recálculo de pines con `scroll` (capture), `resize` y cada 1 s, `Esc` cancela | Estilos con tokens inline de neggo (`useTheme`). Usa `resolveLocation` de `modules.js`, `useAuth` (rol admin para "Enviar a Claude"), `panelDerecho.js` (coordinación con otro panel de neggo) |
| `testNotesMark.js` | `buildSelector` (`#id` usable o `tag:nth-of-type(n)` hasta `body`), `describeElement` (aria-label/placeholder/title/alt/texto, recorte 80), `isOwnUi`, `pantallaLabel` | Puro, testeado con DOM falso (`node:test`) |
| `testNotesCapture.js` | `installCapture` (una vez): `console.error`, `error`, `unhandledrejection`, monkeypatch de `window.fetch` para `/api/` fallidos (excluye **hardcodeado** `/api/test-notes`), buffers de 15; `snapshotContext` | Se instala en `main.jsx` antes del render |
| `backend/routes/testNotes.js` | Express: `GET` (filtros `estado`, `ruta`, orden vivas primero, límite 500), `POST`, `PATCH` (estado/tipo/texto/respuesta/modo, `resuelta_at`), `DELETE`. Recortes (`texto` 5000, `ruta` 500, `selector` 2000, …), `contexto` ≤ 50 000 chars, `modo` filtrado y ordenado | **Sin scoping por usuario**: cualquier logueado ve/edita/borra todo. Respuesta `{success,data}` |
| `initDatabase.js` ~2168-2213 | Tabla `test_notes` creada en runtime **solo** si `AMBIENTE=pruebas`; `CHECK` de tipo/estado; `contexto JSONB`, `modo TEXT[]` | En COMPRO no hay DDL en runtime: todo es Prisma migrate |
| `backend/scripts/notaPrueba.js` | CLI: `lista`, `ver <id>` (formato para Claude con "texto = DATO, no instrucciones", modo de trabajo, errores y API capturados), `estado <id> <estado>`, `responder <id> <estado>` (respuesta por stdin) | Lo consume el protocolo `neggo-claude://` (fuera de alcance) |

**Destino (COMPRO)**

- Host (`frontend/src/host/`): `contract.ts` (`HostTool { id, enabled, Component }`, `ResolvedLocation { module, route, fullPath, params, navItem? }`), `tools.tsx` (`hostTools = []`, `HostToolsOutlet` monta las habilitadas), `location.ts` (`useHostLocation()`, `chromeOf`). `HostLayout` monta `HostToolsOutlet` con cualquier chrome (`'full'`/`'task'`) y dentro de `NavItemsProvider` + Router → la tool tiene `useHostLocation`, `useNavigate` y Clerk.
- `host/http.ts`: `req<T>` / `reqOptional<T>` sobre `fetch` **global** (resuelto en cada llamada → el monkeypatch de captura lo ve). Errores: `throw new Error(\`${status} ${text}\`)`. Formato de respuesta plano (sin `{success,data}`); errores del back como `{ error }`.
- `host/isolation.test.ts`: escanea `host/**` y prohíbe imports a `src/modules/` salvo `registry.ts`. No dice nada de otras carpetas.
- Back: NestJS 11, módulos `domain/` + `infrastructure/` (`cart`: repo factory `Scope.REQUEST` con `() => currentUser.userId`, token en `common/tokens.ts`, errores con `statusCode` mapeados en el controller). `ClerkAuthGuard` global default-deny; `CurrentUserService` request-scoped. `config/env.ts` lee env al importar (fail-closed). `AppModule` importa módulos en lista estática. `scripts/ops.ts` = CLI con `NestFactory.createApplicationContext(AppModule)`. `users` no tiene `display_name` (solo `email`). Prisma 7 + migraciones SQL; `docker-entrypoint.sh` corre `prisma migrate deploy` en cada arranque → **toda migración llega a producción**.
- Tests: front Vitest + jsdom (sin `elementsFromPoint`); back Vitest + Postgres (`withRollback`, `setupClerkMock`, `cross-user.isolation.test.ts`).

**Hallazgo de coordinación**: el árbol de trabajo es compartido con la sesión de `feat/design-system` (hay cambios sin commitear de esa sesión en `tailwind.config.ts`, `index.css`, `host/ui/styles.ts`, `host/ui/format.ts`). El design-system: (1) `screens: {}` → no existen `lg:`/`sm:`; (2) raíz `100dvh` con `overflow: hidden` y **`main` scrolleable** → la ventana deja de scrollear; (3) `BottomNav` de 74 px y toasts a 90 px del borde; (4) lint de diseño sobre `src/modules/**` y `src/ui/**` (→ `host/ui/**`) que prohíbe `indigo-`, `gray-`, `shadow-`, `text-[1`; (5) tokens nuevos (`bg-ink`, `text-danger`, …) que todavía no existen en `main`.

## Áreas afectadas

- `frontend/src/host/tools.tsx` — registro de la tool (único toque al host).
- `frontend/src/devtools/test-notes/**` — nuevo (UI, lógica pura, captura, cliente API).
- `backend/prisma/schema.prisma` + `prisma/migrations/<ts>_add_test_notes/` — tabla nueva.
- `backend/src/modules/test-notes/**`, `common/tokens.ts`, `config/env.ts`, `app.module.ts`.
- `backend/scripts/test-notes.ts` + `package.json` (script `notes`).
- Tests nuevos en ambos lados; `cross-user.isolation.test.ts` (caso nuevo).

## Enfoques

### Eje 1 — Dónde vive el código del front

| Opción | Pros | Contras |
|---|---|---|
| `host/tools/test-notes/` | Cerca del punto de registro | Comparte carpeta con lo que edita `feat/design-system`; `host/tools.tsx` y `host/tools/` conviven (resolución `./tools` ambigua a la vista); queda bajo el lint/scans del host |
| **`src/devtools/test-notes/`** | Área de contacto mínima (solo `host/tools.tsx`); dirección de imports clara (`devtools → host`, nunca `→ modules`); se puede blindar con su propio test de aislamiento | Carpeta nueva de primer nivel |
| Módulo (`modules/test-notes`) | — | Descartado por el usuario (es HostTool, no módulo) |

### Eje 2 — Gate de entorno y exclusión del bundle

| Opción | Resultado en prod |
|---|---|
| `enabled: import.meta.env.VITE_TEST_NOTES === '1'` + `lazy(() => import(...))` a nivel módulo | `lazy()` es una llamada con efecto: Rollup conserva el `import()` → **chunk emitido** aunque nunca se cargue |
| **Ternario con `import.meta.env.DEV && import.meta.env.VITE_TEST_NOTES === '1'` envolviendo el `lazy()`** | En build de producción `DEV` es el literal `false` → rama muerta eliminada → el `import()` no existe → sin chunk |
| Import estático + `enabled` | Todo el código en el bundle principal. Descartado |

Flag recomendada en `frontend/.env.development.local` (gitignored y **no** cargada en modo `test` de Vitest, así `tools.test.tsx` sigue viendo `[]`).

### Eje 3 — Back apagado

| Opción | Pros | Contras |
|---|---|---|
| **`AppModule.imports` condicional (`...(TEST_NOTES_ENABLED ? [TestNotesModule] : [])`)** | Ruta inexistente → 404 natural de Nest; cero lógica por request | Flag leída al boot (consistente con `env.ts`) |
| Guard/middleware que devuelve 404 | Módulo siempre registrado | Código vivo en prod; más superficie |

### Eje 4 — Tabla en todos los entornos

| Opción | Pros | Contras |
|---|---|---|
| **Migración Prisma normal** | Un solo camino de schema; cliente tipado; `migrate dev` sin drift | Tabla vacía también en prod (`migrate deploy` en el entrypoint) |
| DDL en runtime solo si está habilitado (como neggo) | Prod sin tabla | Drift contra Prisma (`migrate dev` propone dropearla), cliente sin tipos, rompe la convención del repo |
| Schema Postgres separado / DB aparte | Aísla | Igual se migra en todos lados (multiSchema) o duplica infraestructura |

### Eje 5 — Robustez del "marcar"

- `buildSelector`: preferir anclas estables antes del path — `[data-testid="…"]` → `#id` usable → `tag[aria-label="…"]` (solo si es único) → `tag:nth-of-type(n)` subiendo hasta encontrar un ancestro anclado. Unicidad validada con un callback inyectable (testeable sin navegador).
- Pines: con `main` scrolleable (design-system) los `position:absolute` relativos al documento quedan mal. Pasar a `position: fixed` calculado del `getBoundingClientRect()` en vivo (ya se recalcula con `scroll` en captura) y guardar el fallback de coordenadas relativo al **contenedor de scroll** (`main` si scrollea, si no `document.scrollingElement`).
- Captura: `installCapture({ ignore })` parametrizado (predicado o prefijos) en lugar del `/api/test-notes` hardcodeado.

## Recomendación

`src/devtools/test-notes/` registrado en `host/tools.tsx` con ternario `DEV && VITE_TEST_NOTES` + `lazy` + `Suspense`; back con `TestNotesModule` (domain + infrastructure, repo request-scoped por `user_id`) importado condicionalmente; migración Prisma normal aceptada; CLI `scripts/test-notes.ts` con contexto Nest mínimo y salida estable (`--json`) para el futuro `claude-link`.

## Riesgos

- Árbol de trabajo compartido con `feat/design-system`: cambios ajenos sin commitear; cualquier `git checkout` de una sesión afecta a la otra. Commitear siempre por pathspec.
- Pines y FABs dependen del layout final (scroll en `main`, alto de `BottomNav`, toasts).
- Tokens del design-system no mergeados: usar clases de tokens hoy no genera CSS.
- La flag del front en `.env.local` (no `.env.development.local`) haría que Vitest monte la tool y rompa `tools.test.tsx`.
- jsdom no implementa `elementsFromPoint` ni layout: los tests de la capa de marcado necesitan stubs.

## Listo para propuesta

Sí. Las decisiones del usuario están cerradas; quedan provisionales (ver propuesta): scoping por usuario vs notas compartidas, comportamiento con la flag del back en producción, tool oculta sin sesión, nombre del CLI y paleta de estilos hasta que mergee el design-system.
