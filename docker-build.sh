#!/bin/bash
# Script de build que evita el problema de cache de OneDrive con Docker
set -e

BUILD_DIR="/tmp/compro-docker-$(date +%s)"
SRC="$(cd "$(dirname "$0")" && pwd)"

echo "Copiando fuentes a $BUILD_DIR ..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp -r "$SRC/." "$BUILD_DIR/"
rm -rf "$BUILD_DIR/backend/node_modules" \
       "$BUILD_DIR/frontend/node_modules" \
       "$BUILD_DIR/frontend/dist" \
       "$BUILD_DIR/compro.db" \
       "$BUILD_DIR/compro.db.lock" \
       "$BUILD_DIR/$BUILD_DIR" 2>/dev/null || true

echo "Ejecutando docker build desde $BUILD_DIR ..."
cd "$BUILD_DIR"
docker build --no-cache -t compro:latest .

echo ""
echo "Build completado. Para correr:"
echo "  docker compose up -d   (desde $SRC)"
echo ""
echo "O con la imagen tagueada:"
echo "  docker run -d -p 3001:3001 -v compro-data:/app/data --name compro compro:latest"

rm -rf "$BUILD_DIR"
