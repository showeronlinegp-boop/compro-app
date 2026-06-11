# ── Stage 1: build del frontend ──────────────────────────────────────────────
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: build del backend TypeScript (produces dist/) ───────────────────
FROM node:24-alpine AS backend-builder
WORKDIR /app/backend

# Native build deps for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
# Install including devDependencies (needed for tsup, typescript)
RUN npm ci

COPY backend/ ./
RUN npm run build

# ── Stage 3: imagen final (backend + frontend compilado) ──────────────────────
FROM node:24-alpine
WORKDIR /app

# Native build deps required at runtime for better-sqlite3 .node binding
RUN apk add --no-cache python3 make g++

# Install production deps only (tsx not needed — we run from dist/)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy compiled dist/ — pure node dist/main.js (Slice 6 final cutover)
COPY --from=backend-builder /app/backend/dist ./backend/dist

COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# La DB vive en un volumen separado para sobrevivir reinicios
ENV DB_PATH=/app/data/compro.db
ENV PORT=3001

EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
