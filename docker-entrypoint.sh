#!/bin/sh
set -e

# Crear directorio de datos si no existe
mkdir -p "$(dirname "$DB_PATH")"

# Pure TypeScript mode (Slice 6 final cutover): run compiled dist/main.js directly.
# tsx is no longer needed — all legacy CJS files have been removed.
exec node /app/backend/dist/main.js
