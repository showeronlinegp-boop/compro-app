# Delta for App Shell (host)

> Base: `openspec/changes/app-shell/specs/app-shell/spec.md` (H7). `app-shell` todavía no está archivado en `openspec/specs/`.

## MODIFIED Requirements

### Requirement: H7 — `HostToolsOutlet`

El host MUST montar `HostToolsOutlet` dentro de la columna del layout (con cualquier chrome), después de `main`, la barra inferior y la región de toasts y renderizar solo las `HostTool` con `enabled: true`. `hostTools` MAY incluir herramientas de desarrollo cuya inclusión dependa de flags de build; con esas flags apagadas `hostTools` MUST ser una lista vacía y el DOM del layout MUST ser idéntico al de antes. Una tool cargada en diferido MUST montarse dentro de un límite `Suspense` con `fallback` nulo, sin afectar el render del resto del layout.
(Previously: "`hostTools` vacío en este cambio"; el outlet devolvía `null` con la lista vacía.)

#### Scenario: Flags apagadas
- GIVEN el host sin `VITE_TEST_NOTES`
- WHEN se monta el layout
- THEN `hostTools` es `[]` y `HostToolsOutlet` no agrega markup

#### Scenario: Tool diferida
- GIVEN una `HostTool` habilitada cuyo componente es lazy
- WHEN se monta el layout
- THEN el `main`, la barra inferior (si el chrome es `'full'`) y la región de toasts se renderizan sin esperar a la tool, y la tool aparece al resolver su chunk
