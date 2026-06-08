# ── Stage 1: build del frontend ──────────────────────────────────────────────
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: imagen final (backend + frontend compilado) ──────────────────────
FROM node:24-alpine
WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend/ ./backend/
COPY vtex-crawler.js ./
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# La DB vive en un volumen separado para sobrevivir reinicios
ENV DB_PATH=/app/data/compro.db
ENV PORT=3001

EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
