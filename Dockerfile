# ── Stage 1: build del frontend ──────────────────────────────────────────────
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
# Vite embebe las VITE_* al compilar: Railway las pasa como build args.
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_NEGGO_PEDIDOS_URL
RUN npm run build

# ── Stage 2: build del backend TypeScript (produces dist/) ───────────────────
FROM node:24-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/package*.json ./
COPY backend/prisma ./prisma
RUN npm ci

COPY backend/ ./
# Generate Prisma client before building. prisma.config.ts exige DATABASE_URL,
# pero generate no se conecta: alcanza una URL ficticia que no queda en la imagen.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate
RUN npm run build

# ── Stage 3: imagen final (backend + frontend compilado) ──────────────────────
FROM node:24-alpine
WORKDIR /app

COPY backend/package*.json ./backend/
COPY backend/prisma ./backend/prisma
COPY backend/prisma.config.ts ./backend/prisma.config.ts
RUN cd backend && npm ci --omit=dev --ignore-scripts

# Copy compiled dist/
COPY --from=backend-builder /app/backend/dist ./backend/dist
# Copy generated Prisma client
COPY --from=backend-builder /app/backend/node_modules/.prisma ./backend/node_modules/.prisma
COPY --from=backend-builder /app/backend/node_modules/@prisma ./backend/node_modules/@prisma

COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV PORT=3001

EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
