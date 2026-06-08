#!/bin/sh
set -e

# Si el contenedor crasheó, node-sqlite3-wasm deja un .lock huérfano
rm -rf "${DB_PATH}.lock"

# Crear directorio de datos si no existe
mkdir -p "$(dirname "$DB_PATH")"

exec node backend/server.js
