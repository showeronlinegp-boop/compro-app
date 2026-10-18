# Flujo de trabajo

## Reglas

1. **`main` es la versión estable.** Nadie pushea directo a `main`: todo entra por Pull Request.
2. **Una rama corta por tarea**, creada desde `main` actualizado. Dura días, no meses, y se borra al mergear.
3. **El CI tiene que estar en verde** antes de mergear (typecheck + tests de backend y frontend).

## Nombres de ramas

| Prefijo | Para qué | Ejemplo |
|---|---|---|
| `feat/` | Funcionalidad nueva | `feat/lista-compartida` |
| `fix/` | Corrección de bug | `fix/precio-vea-sin-stock` |
| `chore/` | Infra, dependencias, config | `chore/actualizar-prisma` |
| `refactor/` | Cambiar estructura sin cambiar comportamiento | `refactor/cart-repo` |

Los commits siguen [Conventional Commits](https://www.conventionalcommits.org/): `feat(cart): ...`, `fix(sync): ...`.

## El ciclo de una tarea

```bash
# 1. Arrancar desde main actualizado
git switch main
git pull
git switch -c feat/mi-tarea

# 2. Después de traer cambios de main: SIEMPRE estos dos pasos
(cd backend && npm install && npx prisma migrate deploy)
(cd frontend && npm install)

# 3. Trabajar y commitear
git add <archivos>
git commit -m "feat(scope): descripción"

# 4. Si main avanzó mientras trabajabas, traerlo a tu rama
git fetch origin
git merge origin/main

# 5. Subir y abrir el PR
git push -u origin feat/mi-tarea
gh pr create --base main

# 6. Con el CI en verde: mergear (squash) y borrar la rama
gh pr merge --squash --delete-branch
```

## Migraciones de base de datos

- Una migración que agrega una columna `NOT NULL` a una tabla **con datos** falla. Agregá un `DEFAULT` o un backfill en la misma migración.
- Si un `prisma migrate deploy` falla, **no** corras `migrate resolve --rolled-back` a ciegas: Postgres puede haber aplicado parte de los statements. Revisá primero el estado real de la base.
- Nunca uses `prisma migrate dev` contra una base que no sea tu base local.

## Operaciones (sync, enrich, promos)

Ya no se disparan por HTTP. Se corren por CLI desde `backend/`:

```bash
npm run ops -- sync [super|all]
npm run ops -- enrich [super|all]
npm run ops -- promos [super|all]
```

## Notas de prueba ("Marcar en pantalla")

Herramienta para anotar errores, mejoras y dudas mientras probás la app: tocás el elemento que falla y queda un pin numerado. **Solo existe en desarrollo local**: el build de producción no la incluye y el backend se niega a arrancar si se prende con `NODE_ENV=production`.

Para prenderla:

1. `backend/.env` → `TEST_NOTES_ENABLED=1`, y reiniciá el backend.
2. `frontend/.env.development.local` → `VITE_TEST_NOTES=1`, y reiniciá Vite. Va en ese archivo y no en `.env.local`, porque Vitest también lee `.env.local`.

Las notas son compartidas entre todas las cuentas de prueba. Para trabajarlas desde la terminal, desde `backend/`:

```bash
npm run notes -- lista                      # notas vivas
npm run notes -- ver <id>                   # detalle completo (texto, elemento, errores capturados)
npm run notes -- estado <id> <estado>       # abierta | en_curso | consulta | para_revisar | corregida | descartada
echo "Listo" | npm run notes -- responder <id> para_revisar
```

Todos aceptan `--json`.
