# Propuesta: test-notes — notas de prueba con "Marcar en pantalla"

> Análisis y alternativas en `exploration.md`.

## Intención

Probar COMPRO a mano hoy no deja rastro: los problemas se anotan afuera, sin pantalla, sin elemento y sin la pista técnica. Portamos de neggo el sistema de **notas de prueba**: tocás el elemento que falla, queda un pin numerado y la nota guarda ruta, pantalla, elemento, errores de consola y llamadas a `/api` que fallaron. Es una **herramienta del host** (no un módulo) y existe **solo en desarrollo local**.

## Alcance

**Adentro**
- Front `src/devtools/test-notes/`: FABs "Marcar"/"Notas (n)", capa de marcado, pines, panel lateral (crear, filtrar, cambiar estado/modo, borrar, ir a la nota), captura de contexto. Registrada en `host/tools.tsx`; funciona con chrome `'full'` y `'task'`.
- Back `modules/test-notes/` (domain + infrastructure): CRUD `/api/test-notes` con validación y recortes; tabla `test_notes` (migración Prisma).
- CLI `npm run notes -- lista | ver <id> | estado <id> <estado> | responder <id> <estado>` con salida estable (`--json`) para el futuro `claude-link`.
- Gate: `VITE_TEST_NOTES=1` + `import.meta.env.DEV` (fuera del bundle de prod) y `TEST_NOTES_ENABLED=1` (sin la flag, el módulo no se registra → 404).
- Mejoras baratas: selector con anclas estables (`data-testid` → id → `aria-label` único → path); captura con exclusión parametrizable; pines `fixed` que soportan `main` scrolleable.

**Afuera**
- Protocolo `neggo-claude://`, botón "Enviar a Claude", scripts `.ps1` y skill `nota-prueba` (cambio `claude-link`).
- Roles, allowlist, uso en staging/producción, coordinación con otros paneles (`panelDerecho.js`).

## Enfoque

| Pieza | Decisión |
|---|---|
| Ubicación front | `src/devtools/test-notes/` (`devtools → host` permitido; `devtools ↛ modules`; solo `host/tools.tsx` importa `devtools`) |
| Exclusión del bundle | ternario `DEV && VITE_TEST_NOTES === '1'` que envuelve `lazy(() => import(...))` |
| Ubicación/pantalla | `useHostLocation()` → `módulo › título de ruta` |
| HTTP | cliente sobre `host/http.ts` (`req`) |
| Estilos | Tailwind estándar + `FOCUS_RING*` de `host/ui/styles.ts`; sin prefijos de breakpoint |
| Back | `TestNotesModule` patrón `cart` (repo factory `Scope.REQUEST` + `user_id`), import condicional en `AppModule` |
| Tabla | migración Prisma normal: existe vacía en todos los entornos (aceptado; ver design) |

## Áreas afectadas

| Área | Impacto |
|---|---|
| `frontend/src/host/tools.tsx` | Modificado (registro) |
| `frontend/src/devtools/test-notes/**` | Nuevo |
| `backend/prisma/schema.prisma`, `prisma/migrations/*_add_test_notes` | Nuevo modelo + migración |
| `backend/src/modules/test-notes/**`, `common/tokens.ts`, `config/env.ts`, `app.module.ts` | Nuevo / modificado |
| `backend/scripts/test-notes.ts`, `backend/package.json` | Nuevo CLI + script |
| `CONTRIBUTING.md` | Sección "Notas de prueba" |

## Riesgos

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Choque con `feat/design-system` (mismo árbol de trabajo, layout/BottomNav/toasts) | Alta | Un solo toque al host; tool autocontenida; posicionamiento por medición; commits por pathspec |
| Código de la tool en el bundle de prod | Baja | Rama muerta por `DEV`; verificación manual con `rg` sobre `dist/` |
| Flag del back activa en prod | Baja | Arranque falla si `TEST_NOTES_ENABLED=1` y `NODE_ENV=production` |
| Tabla vacía en prod | Cierta | Inocua (sin rutas); documentado |

## Rollback

Rama `feat/test-notes`, commits por capa. Post-merge: `git revert` del squash y una migración `drop_test_notes`. Sin revert: apagar las flags deja todo inerte.

## Criterios de éxito

- [ ] Typecheck + tests en verde en front y back.
- [ ] Sin flags: `hostTools` vacío, `/api/test-notes` → 404, build de prod sin rastro de `test-notes`.
- [ ] Con flags: marcar, guardar, ver pin, cambiar estado y borrar funcionan en rutas `'full'` y `'task'`.
- [ ] `npm run notes -- ver <id>` muestra nota, modo, errores y API capturados.
- [ ] El host solo cambia en `host/tools.tsx`.

## Decisiones provisionales — validar con el usuario

| # | Decisión elegida | Alternativa |
|---|---|---|
| P1 | Notas **por usuario** (`user_id` scoping, como el resto de la API); el CLI ve todas | Compartidas entre cuentas de prueba (como neggo) |
| P2 | `TEST_NOTES_ENABLED=1` con `NODE_ENV=production` **aborta el arranque** | Ignorar la flag con warning |
| P3 | Sin sesión de Clerk la tool **no se muestra** | Mostrarla deshabilitada |
| P4 | CLI `npm run notes` con comandos en castellano (compatibles con `notaPrueba.js`) + `--json` | Otro nombre / solo texto |
| P5 | Paleta Tailwind estándar hasta que mergee el design-system; migrar a tokens después | Esperar a `feat/design-system` y usar tokens ya |
