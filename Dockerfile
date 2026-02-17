# ─────────────────────────────────────────────────────────────────────
# MedicineManager — Multi-stage Dockerfile
# Produces two targets: "frontend" (nginx) and "backend" (node)
# ─────────────────────────────────────────────────────────────────────

# ── Stage 1: monorepo install ──────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

# Use hoisted node_modules so deps are flat and directly copyable
RUN echo "node-linker=hoisted" > .npmrc && pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/ apps/

# ── Stage 2: Build shared package ──────────────────────────────────
FROM base AS build-shared
WORKDIR /app/packages/shared
RUN pnpm build

# ── Stage 3: Build frontend ───────────────────────────────────────
FROM base AS build-web
COPY --from=build-shared /app/packages/shared/dist /app/packages/shared/dist
WORKDIR /app/apps/web
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm build

# ── Stage 4: Build backend ────────────────────────────────────────
FROM base AS build-api
COPY --from=build-shared /app/packages/shared/dist /app/packages/shared/dist
WORKDIR /app/apps/api
RUN pnpm run build

# ── Target: Frontend (nginx serving static files) ─────────────────
FROM nginx:1.27-alpine AS frontend

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=build-web /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# ── Target: Backend (Node.js running NestJS) ──────────────────────
FROM node:20-alpine AS backend
WORKDIR /app

# Copy built backend + hoisted production dependencies
COPY --from=build-api /app/apps/api/dist ./dist
COPY --from=build-api /app/apps/api/package.json ./package.json
COPY --from=build-api /app/node_modules ./node_modules
COPY --from=build-shared /app/packages/shared/dist ./node_modules/@medicine-manager/shared/dist
COPY --from=build-shared /app/packages/shared/package.json ./node_modules/@medicine-manager/shared/package.json

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main.js"]
