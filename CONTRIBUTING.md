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
