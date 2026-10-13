# Tasks: test-notes — notas de prueba con "Marcar en pantalla"

> `VB` = `cd backend && npm run typecheck && npm test` (con Postgres de test y `npm run db:test:setup` tras la migración). `VF` = `cd frontend && npm run typecheck && npm test`. Cada tarea y cada commit cierran en verde. Sin build. 🖐 = verificación manual del usuario. Commitear SIEMPRE con pathspec. Layout de referencia: `main` post design-system (#34), ver design §"Layout real del host".

## Commit 1 — `feat(backend): modelo test_notes y dominio de notas de prueba`

- [ ] 1.1 `prisma/schema.prisma`: `model test_notes` según el design + `test_notes test_notes[]` en `users` (A2–A6)
- [ ] 1.2 `prisma/migrations/20261013000000_add_test_notes/migration.sql`: tabla, `CHECK` de `tipo`/`estado`, índices `(user_id, estado)` y `(user_id, ruta)`, FK cascade; `prisma generate` + `db:test:setup`
- [ ] 1.3 `modules/test-notes/domain/test-note.ts`: constantes, tipos, `parseCreate`, `parsePatch` (recortes, defaults, `modo` filtrado/ordenado, `contexto` ≤ 50 000, `resuelta_at`) (A2, A4)
- [ ] 1.4 `domain/test-note.test.ts`: escenarios "Alta completa", "Texto vacío", "Contexto excedido", patch inválido/vacío, `resuelta_at` (A2, A4). Verif: `VB`

## Commit 2 — `feat(backend): API /api/test-notes detrás de TEST_NOTES_ENABLED`

- [ ] 2.1 `config/env.ts`: `resolveTestNotesFlag`, `TEST_NOTES_ENABLED`, `TEST_NOTES_APP_URL`; casos en `env.test.ts` (sin flag, `'1'`, `'1'` + prod → error) (A1)
- [ ] 2.2 `common/tokens.ts`: `TEST_NOTES_REPO`, `TEST_NOTES_ADMIN_REPO`
- [ ] 2.3 `infrastructure/test-notes.repo.ts`: `makeTestNotesRepo(prisma, uid)` (list `$queryRaw` vivas primero + `autor`, LIMIT 500; `updateMany`/`deleteMany` por `{id, user_id}` → 404) y `makeTestNotesAdminRepo(prisma)` (A3–A6)
- [ ] 2.4 `test-notes.repo.test.ts` con `withRollback`: orden, filtros, `resuelta_at`, 404 ajeno, admin `listVivas`/`get`/`setEstado` (A3–A6). Verif: `VB`
- [ ] 2.5 `test-notes.controller.ts` (`GET`, `POST` 201, `PATCH /:id`, `DELETE /:id`; id inválido → 400) + `test-notes.module.ts` (repo `Scope.REQUEST`) (A2–A5)
- [ ] 2.6 `app.module.ts`: `...(TEST_NOTES_ENABLED ? [TestNotesModule] : [])` (A1)
- [ ] 2.7 `test/http/test-notes.e2e.test.ts`: módulo con flag (401, 201, 400, PATCH, DELETE, 404) + `AppModule` sin flag → 404 (A1–A5)
- [ ] 2.8 `cross-user.isolation.test.ts`: describe "Test notes isolation" (A6). Verif: `VB`

## Commit 3 — `feat(backend): CLI de notas de prueba (npm run notes)`

- [ ] 3.1 `domain/cli.ts`: `parseCliArgs`, `formatLista`, `formatVer` (bloque DATO, modo de trabajo, errores/API), salida `--json` (A7)
- [ ] 3.2 `domain/cli.test.ts`: escenarios "Estado inválido", "Modo directo en ver", id inválido, `--json` estable (A7)
- [ ] 3.3 `infrastructure/test-notes-cli.module.ts` + `scripts/test-notes.ts` (gate `TEST_NOTES_ENABLED`, stdin en `responder`, exit ≠ 0 en errores) + script `notes` en `package.json` (A7). Verif: `VB`
- [ ] 3.4 🖐 `echo "Listo" | npm run notes -- responder <id> para_revisar` y `npm run notes -- ver <id>` contra la base local (A7)

## Commit 4 — `feat(frontend): lógica pura de test-notes`

- [ ] 4.1 `devtools/test-notes/{types,constants}.ts` (T5, T7)
- [ ] 4.2 `mark.ts` + `mark.test.ts`: port de los tests de neggo + "data-testid gana", `aria-label` único/no único, "Id generado", `pantallaLabel` con `ResolvedLocation` ("Módulo › Título"), `null` en `/mas` → "Más", `/` → "Inicio", otro → pathname (T4, T5)
- [ ] 4.3 `capture.ts` + `capture.test.ts`: "API fallida", "Llamada propia excluida", sin respuesta, idempotencia, `console.error` original preservado, límite 15 (T8)
- [ ] 4.4 `geometry.ts` + `geometry.test.ts`: `readFrame` (raíz `main` hijo de la columna / fallback documento, banda visible), `toRootY`/`fromRootY` (documento y elemento), `markFromPoint` (`pos_x` sobre el ancho de `main`), `pinPosition` exacto/aproximado/fuera de banda/null en coordenadas de la columna, `fabBottom` (región de toasts a 90 px → 154, a 20 px → 84, sin región → barra + 16 / 16) (T2, T3, T6)
- [ ] 4.5 `api.ts` + `api.test.ts` (`apiErrorMessage`, paths y métodos con `fetch` stub) (T5, T7). Verif: `VF`

## Commit 5 — `feat(frontend): herramienta Notas de prueba`

- [ ] 5.1 `components/{MiniButton,ModoChecklist,Fabs,MarkLayer,Highlights,Pins}.tsx` con tokens del design-system + `FOCUS_RING*` (clases por tipo/estado en `constants.ts`); sin breakpoints, sombras, emoji ni texto < 12 px; `absolute` dentro de la raíz de la tool (T2, T3, T6, T10)
- [ ] 5.2 `components/{DraftForm,NoteCard,Sheet}.tsx`: hoja inferior de ancho completo (`absolute inset-x-0 bottom-0 max-h-[85%]`) (T5, T7, T10)
- [ ] 5.3 `TestNotes.tsx` (raíz `[data-test-notes]` `absolute inset-0 z-[60] pointer-events-none` en la columna, sin portal; `column = ref.parentElement`; pantalla con `useActiveModule().location`; FABs con `fabBottom` recalculado por `location`/`resize`; polling 60 s, recálculo de pines, Esc, ir a la nota, `null` sin sesión, `installCapture` al montar) + `index.tsx` (T1–T8)
- [ ] 5.4 `TestNotes.test.tsx` con `HostApp` + módulo falso: "Sin sesión", "Ruta de tarea", "Clic sobre un botón de la app", "Escape", "Nota sin marcar", "Elemento desaparecido", "Confirmar corrección", "Borrado con confirmación", "Montaje en la columna", error conserva borrador (T1–T7, T10). Verif: `VF`
- [ ] 5.5 `host/ui/design-lint.test.ts`: sumar `../../devtools/**/*.{ts,tsx}` (y su exclusión de tests) al glob + `toContain('../../devtools/test-notes/TestNotes.tsx')` (T10). Verif: `VF`

## Commit 6 — `feat(frontend): registrar test-notes en hostTools con gate de build`

- [ ] 6.1 `host/tools.tsx`: ternario `DEV && VITE_TEST_NOTES === '1'` con `lazy`; `HostToolsOutlet` envuelve cada tool en `Suspense` (T1, H7)
- [ ] 6.2 `host/tools.test.tsx`: "Flags apagadas" y "Tool diferida" (H7). Verif: `VF`
- [ ] 6.3 `devtools/isolation.test.ts`: `devtools ↛ modules`; solo `host/tools.tsx` importa `devtools`; caso sintético "Import prohibido" (T9). Verif: `VF`
- [ ] 6.4 `CONTRIBUTING.md`: sección "Notas de prueba" (flags, `.env.development.local`, `npm run notes`) y `TEST_NOTES_ENABLED=` comentado en `backend/.env.example`
- [ ] 6.5 🖐 Con ambas flags: marcar, guardar, pin, filtros, Confirmar/Reabrir/Borrar, "Ir a la nota" entre rutas, en una ruta `'full'` y una `'task'`, con scroll dentro de `main`, con un toast visible (los FABs no lo tapan) y en desktop (nada fuera de la columna de 480 px) (T2–T7, T10)
- [ ] 6.6 🖐 `cd frontend && VITE_TEST_NOTES=1 npx vite build && rg -l "test-notes" dist` → vacío (T1 "Build de producción")
