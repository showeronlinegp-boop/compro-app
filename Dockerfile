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
# prisma.config.ts exige DATABASE_URL y tanto `npm ci` (postinstall) como
# `npm run build` corren `prisma generate`, que no se conecta a la base.
# URL ficticia para toda esta etapa; la imagen final no la hereda.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY backend/package*.json ./
COPY backend/prisma ./prisma
RUN npm ci

COPY backend/ ./
# `npm run build` = prisma generate && tsup
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
