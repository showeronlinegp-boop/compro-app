# Propuesta: test-notes — notas de prueba con "Marcar en pantalla"

> Análisis y alternativas en `exploration.md`.

## Intención

Probar COMPRO a mano hoy no deja rastro: los problemas se anotan afuera, sin pantalla, sin elemento y sin la pista técnica. Portamos de neggo el sistema de **notas de prueba**: tocás el elemento que falla, queda un pin numerado y la nota guarda ruta, pantalla, elemento, errores de consola y llamadas a `/api` que fallaron. Es una **herramienta del host** (no un módulo) y existe **solo en desarrollo local**.

## Alcance

**Adentro**
- Front `src/devtools/test-notes/`: FABs "Marcar"/"Notas (n)", capa de marcado, pines, hoja inferior (crear, filtrar, cambiar estado/modo, borrar, ir a la nota), captura de contexto. Registrada en `host/tools.tsx`; funciona con chrome `'full'` y `'task'`.
- Back `modules/test-notes/` (domain + infrastructure): CRUD `/api/test-notes` con validación y recortes; tabla `test_notes` (migración Prisma).
- CLI `npm run notes -- lista | ver <id> | estado <id> <estado> | responder <id> <estado>` con salida estable (`--json`) para el futuro `claude-link`.
- Gate: `VITE_TEST_NOTES=1` + `import.meta.env.DEV` (fuera del bundle de prod) y `TEST_NOTES_ENABLED=1` (sin la flag, el módulo no se registra → 404).
- Mejoras baratas: selector con anclas estables (`data-testid` → id → `aria-label` único → path); captura con exclusión parametrizable; pines medidos en vivo sobre `main` (único contenedor que scrollea).

**Afuera**
- Protocolo `neggo-claude://`, botón "Enviar a Claude", scripts `.ps1` y skill `nota-prueba` (cambio `claude-link`).
- Roles, allowlist, uso en staging/producción, coordinación con otros paneles (`panelDerecho.js`).

## Enfoque

| Pieza | Decisión |
|---|---|
| Ubicación front | `src/devtools/test-notes/` (`devtools → host` permitido; `devtools ↛ modules`; solo `host/tools.tsx` importa `devtools`) |
| Exclusión del bundle | ternario `DEV && VITE_TEST_NOTES === '1'` que envuelve `lazy(() => import(...))` |
| Ubicación/pantalla | `useActiveModule().location` (misma resolución que `useHostLocation()`) → `módulo › título de ruta` |
| HTTP | cliente sobre `host/http.ts` (`req`) |
| Estilos | Tokens del design-system + `FOCUS_RING*` de `host/ui/styles.ts`; `devtools/**` entra al `design-lint` |
| Back | `TestNotesModule` patrón `cart` (repo factory `Scope.REQUEST`; `user_id` solo como **autor** al crear), import condicional en `AppModule` |
| Visibilidad | Notas **compartidas** entre todas las cuentas (P1): cualquiera lista, edita, cambia estado y borra |
| Tabla | migración Prisma normal: existe vacía en todos los entornos (aceptado; ver design) |

## Áreas afectadas

| Área | Impacto |
|---|---|
| `frontend/src/host/tools.tsx` | Modificado (registro) |
| `frontend/src/host/ui/design-lint.test.ts` | Modificado (glob de `devtools/**`) |
| `frontend/src/devtools/test-notes/**` | Nuevo |
| `backend/prisma/schema.prisma`, `prisma/migrations/*_add_test_notes` | Nuevo modelo + migración |
| `backend/src/modules/test-notes/**`, `common/tokens.ts`, `config/env.ts`, `app.module.ts` | Nuevo / modificado |
| `backend/scripts/test-notes.ts`, `backend/package.json` | Nuevo CLI + script |
| `CONTRIBUTING.md` | Sección "Notas de prueba" |

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Cambios futuros del layout del host (barra, toasts, `main`) | Media | Supuestos concentrados en `geometry.ts`; posicionamiento por medición; tests de `fabBottom`/`pinPosition` |
| Código de la tool en el bundle de prod | Baja | Rama muerta por `DEV`; verificación manual con `rg` sobre `dist/` |
| Flag del back activa en prod | Baja | Arranque falla si `TEST_NOTES_ENABLED=1` y `NODE_ENV=production` |
| Tabla vacía en prod | Cierta | Inocua (sin rutas); documentado |

## Rollback

Rama `feat/test-notes`, commits por capa. Post-merge: `git revert` del squash y una migración `drop_test_notes`. Sin revert: apagar las flags deja todo inerte.

## Criterios de éxito

- [ ] Typecheck + tests en verde en front y back.
- [ ] Sin flags: `hostTools` vacío, `/api/test-notes` → 404, build de prod sin rastro de `test-notes`.
- [ ] Con flags: marcar, guardar, ver pin, cambiar estado y borrar funcionan en rutas `'full'` y `'task'`.
- [ ] Una nota creada con la cuenta A la ve (y la puede operar) la cuenta B, con A como autor.
- [ ] `npm run notes -- ver <id>` muestra nota, modo, errores y API capturados.
- [ ] El host solo cambia en `host/tools.tsx` (+ test) y el glob de `host/ui/design-lint.test.ts`.

## Decisiones cerradas por el usuario

| # | Decisión | Descartado |
|---|---|---|
| P1 | Notas **compartidas** entre todas las cuentas ("en el ambiente de pruebas todos son usuarios de prueba", como neggo). Cualquier usuario autenticado lista, ve, edita, cambia estado y **borra** cualquier nota. `user_id` queda solo como **autor** (se guarda al crear; la tarjeta muestra `autor`). El CLI ve todas | Notas por usuario (`user_id` scoping) |
| P2 | `TEST_NOTES_ENABLED=1` con `NODE_ENV=production` **aborta el arranque** con error que nombra la flag: la herramienta nunca es para producción | Ignorar la flag con warning |
| P3 | Sin sesión de Clerk la tool **no aparece** | Mostrarla deshabilitada |
| P4 | CLI `npm run notes -- lista \| ver \| estado \| responder` en castellano (compatible con `notaPrueba.js`) + `--json` | Otro nombre / solo texto |

**Borrado (P1)**: cualquiera puede borrar o descartar. Restringir `DELETE` al autor no es trivial del lado del front (no conoce el `users.id` interno: habría que exponer un `es_mia` en el DTO y ramificar la tarjeta) y en un ambiente de solo cuentas de prueba no protege nada real; el borrado ya pide confirmación (T7).

**P5 resuelta** (design-system mergeado en #34): se usan los tokens del design-system desde el primer commit y `src/devtools/**` entra al escaneo de `design-lint.test.ts`.
