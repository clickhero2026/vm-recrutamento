# Vendedor Mestre - Recrutamento Automatico
# Imagem compativel com EasyPanel (Contabo VPS).
# better-sqlite3 e modulo nativo: precisamos das ferramentas de build no estagio de install.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Toolchain para compilar better-sqlite3 (python3 + make + g++)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# ── Imagem final, enxuta ──
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# Copia dependencias ja compiladas e o codigo
COPY --from=build /app/node_modules ./node_modules
COPY . .

# Porta vem de PORT (default 3000). EasyPanel injeta env vars.
ENV PORT=3000
EXPOSE 3000

# Volume persistente: o app.db do SQLite vive aqui (montar /data no EasyPanel).
ENV DATABASE_PATH=/data/app.db

# Migracoes rodam automaticamente no boot (idempotentes), entao basta subir.
CMD ["node", "src/server.js"]
