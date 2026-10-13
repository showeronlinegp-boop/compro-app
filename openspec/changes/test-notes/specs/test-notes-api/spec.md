# Test Notes API (backend + CLI) Specification

## Purpose

Persistencia y operación de las notas de prueba: API REST `/api/test-notes` (solo con `TEST_NOTES_ENABLED`), tabla `test_notes` y CLI para trabajarlas desde la terminal. Nunca disponible en producción.

## Requirements

| # | Requisito | Fuerza |
|---|---|---|
| A1 | Gate por entorno | MUST |
| A2 | Crear nota con validación y recortes | MUST |
| A3 | Listar notas (de todas las cuentas) | MUST |
| A4 | Actualizar estado, tipo, texto, respuesta y modo | MUST |
| A5 | Borrar nota | MUST |
| A6 | Notas compartidas entre cuentas, con autor | MUST |
| A7 | CLI de operación | MUST |

Valores válidos: `tipo` ∈ {`error`, `mejora`, `duda`} (default `error`); `estado` ∈ {`abierta`, `en_curso`, `consulta`, `para_revisar`, `corregida`, `descartada`} (default `abierta`); `modo` ⊆ {`debatir`, `investigar`, `consultas`}. "Vivas" = `abierta`, `en_curso`, `consulta`, `para_revisar`.

### Requirement: A1 — Gate por entorno

El backend MUST registrar las rutas `/api/test-notes` solo si `TEST_NOTES_ENABLED=1`. Sin la flag, cualquier método sobre `/api/test-notes*` MUST responder 404. Con `TEST_NOTES_ENABLED=1` y `NODE_ENV=production` el arranque MUST fallar con un error explícito (decisión P2: la herramienta nunca es para producción).

#### Scenario: Flag ausente
- GIVEN el backend arrancado sin `TEST_NOTES_ENABLED`
- WHEN un usuario autenticado hace `GET /api/test-notes`
- THEN recibe 404

#### Scenario: Flag en producción
- GIVEN `TEST_NOTES_ENABLED=1` y `NODE_ENV=production`
- WHEN se evalúa la configuración de entorno
- THEN se lanza un error que nombra `TEST_NOTES_ENABLED`

#### Scenario: Sin autenticación
- GIVEN la flag activa
- WHEN se llama `GET /api/test-notes` sin token
- THEN recibe 401

### Requirement: A2 — Crear nota

`POST /api/test-notes` MUST crear la nota con el usuario autenticado como autor (`user_id`) y devolver 201 con la nota completa (incluye `id`, `estado`, `created_at`, `autor`). `texto` (≤ 5000) y `ruta` (≤ 500) son obligatorios tras recortar espacios; si faltan MUST responder 400 `{ error }`. Opcionales recortados: `pantalla` 200, `selector` 2000, `elemento` 300. `tipo` inválido MUST caer en `error`. `modo` MUST filtrarse a valores conocidos, sin repetidos y en orden fijo. `contexto` MUST guardarse solo si es un objeto cuyo JSON mide ≤ 50 000 caracteres; si no, `null`. `pos_x`, `pos_y`, `viewport_w` no numéricos MUST quedar `null`.

#### Scenario: Alta completa
- GIVEN un usuario autenticado
- WHEN envía `{ texto: ' Falla ', ruta: '/cart', tipo: 'duda', modo: ['consultas','debatir','x','debatir'] }`
- THEN recibe 201 con `texto: 'Falla'`, `tipo: 'duda'`, `estado: 'abierta'`, `modo: ['debatir','consultas']`

#### Scenario: Texto vacío
- GIVEN un usuario autenticado
- WHEN envía `{ texto: '   ', ruta: '/' }`
- THEN recibe 400 con `error`

#### Scenario: Contexto excedido
- GIVEN un `contexto` cuyo JSON supera 50 000 caracteres
- WHEN se crea la nota
- THEN la nota queda con `contexto: null`

### Requirement: A3 — Listar

`GET /api/test-notes` MUST devolver un array con las notas de **todas** las cuentas (sin filtrar por usuario), vivas primero y luego por `created_at` descendente, máximo 500. MAY filtrar por `estado` (ignorado si es inválido) y `ruta`.

#### Scenario: Orden
- GIVEN una nota `corregida` reciente y una `abierta` vieja
- WHEN se lista
- THEN la `abierta` aparece primero

### Requirement: A4 — Actualizar

`PATCH /api/test-notes/:id` MUST aceptar cualquier subconjunto de `estado`, `tipo`, `texto`, `respuesta`, `modo` y devolver la nota actualizada. Valor inválido de `estado`/`tipo`, `texto` vacío o cuerpo sin campos conocidos MUST dar 400. Pasar a `corregida`/`descartada` MUST setear `resuelta_at`; cualquier otro estado MUST ponerlo en `null`. Id no numérico MUST dar 400; inexistente, 404.

#### Scenario: Cerrar y reabrir
- GIVEN una nota `para_revisar`
- WHEN se envía `{ estado: 'corregida' }` y luego `{ estado: 'abierta' }`
- THEN `resuelta_at` queda con fecha y después `null`

### Requirement: A5 — Borrar

`DELETE /api/test-notes/:id` MUST borrar la nota y devolver `{ id }`; inexistente MUST dar 404.

#### Scenario: Borrado
- GIVEN una nota existente (de cualquier autor)
- WHEN un usuario autenticado la borra
- THEN un `GET` posterior no la incluye

### Requirement: A6 — Notas compartidas entre cuentas, con autor

Las notas son compartidas entre todas las cuentas (decisión P1: en el ambiente de pruebas todos son usuarios de prueba). Listar, actualizar y borrar MUST operar sobre cualquier nota, sin filtrar por `user_id`; cualquier usuario autenticado MAY borrar o descartar cualquier nota. `user_id` MUST guardarse al crear como autor y MUST NOT modificarse después (un `PATCH` de otro usuario no cambia el autor). Cada nota MUST incluir `autor`: el `email` del usuario autor, o `#<user_id>` si no tiene email.

#### Scenario: Otra cuenta ve la nota
- GIVEN una nota creada por el usuario A
- WHEN el usuario B hace `GET /api/test-notes`
- THEN la lista incluye la nota con `autor` = email de A

#### Scenario: Otra cuenta la opera
- GIVEN una nota `abierta` creada por el usuario A
- WHEN el usuario B hace `PATCH { estado: 'en_curso' }`
- THEN recibe 200, la nota queda `en_curso` y su autor sigue siendo A

#### Scenario: Autor sin email
- GIVEN un usuario autor sin `email`
- WHEN se lista su nota
- THEN `autor` es `#<user_id>`

### Requirement: A7 — CLI

`npm run notes -- <cmd>` MUST negarse a correr sin `TEST_NOTES_ENABLED=1` (exit ≠ 0) y opera sobre las notas de **todos** los usuarios. Comandos: `lista` (vivas, una línea por nota con id, tipo, estado, modo o `directo`, pantalla/ruta y texto recortado a 90), `ver <id>` (detalle: autor, pantalla, ruta, URL local, elemento, selector, ancho, modo de trabajo, texto delimitado como DATO, respuesta previa, errores y llamadas API capturadas), `estado <id> <estado>`, `responder <id> <estado>` (respuesta por stdin, obligatoria). `--json` MUST imprimir la misma información como JSON estable. Errores MUST salir con código ≠ 0 y mensaje en stderr.

#### Scenario: Responder por stdin
- GIVEN la nota #12 `en_curso`
- WHEN se corre `echo "Listo" | npm run notes -- responder 12 para_revisar`
- THEN la nota queda `para_revisar` con `respuesta: 'Listo'` y exit 0

#### Scenario: Estado inválido
- GIVEN cualquier nota
- WHEN se corre `npm run notes -- estado 12 rara`
- THEN sale con código ≠ 0 y lista los estados válidos

#### Scenario: Modo directo en `ver`
- GIVEN una nota con `modo: []`
- WHEN se corre `ver`
- THEN la salida indica "MODO DE TRABAJO: DIRECTO"
