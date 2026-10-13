# Propuesta: módulo Fiado (etapa 1)

## Intención

Sumar a Neggo (antes COMPRO) un segundo módulo, **Fiado**, para que el dueño de un comercio anote lo que le deben sus clientes, registre pagos y les mande comprobantes y recordatorios por WhatsApp, todo desde el celular y con una mano.
Fuente de diseño: `DESIGN.md` (mockup de Neggo) y la guía general `docs/design-system.md`.

## Dependencias

1. **`refactor/app-shell`** (en curso): el contrato `AppModule` (rutas + nav + providers en una sola fuente) tiene que estar mergeado. Fiado es el primer módulo nuevo y valida ese contrato.
2. **`feat/design-system`**: tokens, fuentes, primitivas `ui/*` y shell mobile. Fiado no arranca pantallas sin esto.

## Alcance

**Entra (etapa 1)**
- Clientes: alta (nombre, teléfono, límite opcional, próximo cobro opcional, etiqueta), edición, búsqueda, orden (más deuda, más días sin pagar, A a Z).
- Movimientos: anotar fiado y registrar pago con teclado propio, nota opcional, "Pagó todo", pantalla "Listo".
- Ficha: saldo, celdas (límite, sin pagar, próximo cobro), aviso de límite, historial.
- Inicio: total "Te deben", acciones rápidas, "Para cobrar hoy", tarjeta Neggo, últimos 4 movimientos.
- WhatsApp: comprobante de fiado/pago y recordatorio con plantillas editables, vía `wa.me`.
- Ajustes: nombre del comercio, alias, umbral de deuda vieja (30 días por defecto), plantillas, videos de ayuda.
- PWA instalable (manifest + íconos). Online.

**No entra (etapa 1)**
- Funcionamiento offline y cola de sincronización (etapa 2).
- PIN local (etapa 2).
- Varios usuarios por comercio, roles, exportar, reportes.
- Integración real con el pedido a Neggo (la tarjeta es un link externo configurable).
- Migración del comparador al nuevo diseño (change aparte, ver guía §7.1).

## Enfoque

### Backend — `backend/src/modules/fiado/` (mismo patrón que `cart`)

**Modelo (Prisma, todo con `user_id` → `users`, `onDelete: Cascade`)**

| Tabla | Campos clave |
|---|---|
| `fiado_clientes` | `id`, `user_id`, `nombre`, `telefono?`, `etiqueta?`, `limite?` (Int, pesos), `proximo_cobro?` (Date), `archivado_at?`, timestamps. Índice `(user_id, nombre)`. |
| `fiado_movimientos` | `id`, `user_id`, `cliente_id`, `tipo` (`fiado`/`pago`/`correccion`), `monto` (Int pesos con signo; `fiado`/`pago` > 0, ≤ 999.999.999), `corrige_id?` (FK al movimiento corregido, único), `nota?`, `created_at`. Índice `(user_id, cliente_id, created_at)`. **Append-only: no hay UPDATE ni DELETE.** |
| `fiado_recordatorios` | `id`, `user_id`, `cliente_id`, `enviado_at`. |
| `fiado_ajustes` | `user_id` único, `comercio`, `alias?`, `dias_deuda_vieja` (30), `plantilla_fiado`, `plantilla_pago`, `plantilla_recordatorio`. |

**Decisión: libro append-only.** Un movimiento nunca se edita ni se borra. "Deshacer" crea un movimiento `correccion` que apunta al original (`corrige_id`) con el monto opuesto. El historial muestra **los dos**: el original tachado con la etiqueta "Corregido" y la corrección con su fecha y hora. Así ningún registro desaparece y no se puede borrar una deuda a escondidas. Un movimiento se corrige una sola vez (`corrige_id` único) y una corrección no se puede corregir.

**Decisión: saldo calculado, no guardado.** `saldo = Σ fiado − Σ pago ± Σ correcciones`, por agregación. Evita que un saldo cacheado se desincronice; con los volúmenes de un kiosco (cientos de movimientos por cliente) la query con índice alcanza. Si algún día pesa, se agrega una columna mantenida en la misma transacción.

**Dominio puro (`domain/`, testeado sin DB):** cálculo de saldo, días sin pagar (desde el último pago; si nunca pagó, desde el primer fiado; solo con saldo > 0), "para cobrar hoy", exceso de límite, render de plantillas (`{nombre}` = primer nombre), normalización de teléfono argentino para `wa.me` (+54 9 …), formato de dinero.

**API (`/api/fiado/*`, plano como el resto)**

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/api/fiado/resumen` | total, cantidad de clientes, para cobrar hoy, últimos movimientos |
| GET | `/api/fiado/clientes?q=&orden=` | lista con saldo y días sin pagar |
| POST | `/api/fiado/clientes` | cliente creado |
| GET | `/api/fiado/clientes/:id` | ficha + historial |
| PATCH | `/api/fiado/clientes/:id` | cliente actualizado |
| POST | `/api/fiado/movimientos` | movimiento + saldo nuevo + `excede_limite` |
| POST | `/api/fiado/movimientos/:id/correccion` | crea la corrección ("Deshacer"); 409 si ya estaba corregido o si es una corrección |
| POST | `/api/fiado/clientes/:id/recordatorios` | marca "Recordado" |
| GET / PUT | `/api/fiado/ajustes` | ajustes (se crean con defaults al primer GET) |

Tests: dominio (unit, incluye que no existan rutas de UPDATE/DELETE de movimientos), repo (Postgres con rollback), e2e HTTP y **aislamiento entre usuarios** en `test/isolation/` (como `cross-user.isolation.test.ts`).

### Frontend — `frontend/src/modules/fiado/`

```
modules/fiado/
  module.ts          # AppModule: rutas, nav (Inicio, Clientes, Ajustes), providers
  api.ts
  domain/            # formato, plantillas, wa.me (compartido en espíritu con el back)
  pages/             # Inicio, Clientes, Ficha, Anotar, Listo, Recordar, NuevoCliente, Ajustes
  components/        # FilaCliente, SelectorCliente, TarjetaTeDeben, TarjetaNeggo
```

Rutas bajo `/fiado/*`. Pantallas de tarea (`anotar`, `listo`, `recordar`, `nuevo`) sin barra inferior. "Volver" usa el historial para regresar a la pantalla de origen.

## PRs (orden)

| # | Rama | Contenido |
|---|---|---|
| 0 | `refactor/app-shell` | Prerrequisito, ya en curso. |
| 1 | `feat/design-system` | Rebranding a **Neggo** (título, `theme-color`, manifest, textos visibles del host). Tokens en `index.css` + Tailwind, fuentes, `ui/*` con tests, shell mobile (100dvh, safe areas, `BottomNav` desde módulos, "Más"), manifest PWA, test de "lint de diseño". |
| 2 | `feat/fiado-backend` | Migración Prisma, módulo Nest, dominio, API, tests unit/repo/e2e/aislamiento. |
| 3 | `feat/fiado-clientes` | Módulo front registrado en el host; Inicio (sin acciones), Clientes, Ficha, Nuevo cliente. |
| 4 | `feat/fiado-movimientos` | `Keypad`, Anotar fiado / Registrar pago, selector de cliente, Listo, toast con Deshacer (corrección visible en el historial). |
| 5 | `feat/fiado-whatsapp` | Comprobantes, Recordar, Para cobrar hoy, Ajustes con plantillas, tarjeta Neggo. |
| 6 | `chore/fiado-qa` | Pasada de checklist de la guía en 320 / 390 px, contraste, foco, `prefers-reduced-motion`. |

Cada PR deja `typecheck` y `test` verdes en CI y se mergea con squash.

## Módulos afectados

- `backend/prisma/schema.prisma` + migración nueva, `backend/src/modules/fiado/*`, `app.module.ts`, `common/tokens.ts`, tests.
- `frontend/index.html`, `index.css`, `tailwind.config.ts`, `styles.ts` (foco), `src/ui/*` nuevo, `src/modules/fiado/*` nuevo, registro en el host.
- El comparador **no** cambia de comportamiento; puede verse distinto en lo que toque el shell (raíz y barra inferior).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El shell mobile rompe el layout desktop del comparador | Esperado: la app pasa a ser mobile. El comparador queda funcional dentro del ancho de 480 px y se migra en su propio change. |
| Doble toque al confirmar crea dos movimientos | Botón deshabilitado mientras se envía + clave de idempotencia en `POST /movimientos`. |
| Teléfonos cargados en formatos raros | Normalización en dominio con tests; si no se puede normalizar, el botón de WhatsApp abre `wa.me` sin número para elegir el contacto. |
| Mezclar datos entre usuarios | Todo query filtra por `user_id` del `CurrentUserService`; test de aislamiento obligatorio. |

## Rollback

- Front: sacar `fiado` de la lista de módulos del host (una línea) oculta el módulo completo.
- Back: el módulo Nest se desregistra en `app.module.ts`. La migración es aditiva (tablas nuevas, sin tocar las existentes); para revertirla se dropean las cuatro tablas `fiado_*` (destructivo: confirmar antes si ya hay datos reales).

## Decisiones tomadas (2026-10-13)

1. **Días sin pagar:** desde el último pago; si nunca pagó, desde el primer fiado. Solo se muestra con saldo > 0.
2. **PIN:** etapa 2. Clerk alcanza para la etapa 1.
3. **Deshacer:** sí, pero como **corrección visible** (libro append-only, ver Enfoque). Nada se borra.
4. **Offline:** etapa 2. La etapa 1 es online, con un mensaje claro cuando no hay conexión.
5. **Marca:** la app pasa a llamarse **Neggo**. El rebranding visible entra en `feat/design-system`. Renombrar el repo y los paquetes npm queda fuera de este change.
