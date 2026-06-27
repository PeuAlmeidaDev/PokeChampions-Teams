# Single-process image: builds the whole monorepo, then runs the Fastify server
# which serves both /api and the built SPA (packages/web/dist).
#
# Node is pinned to 22 (LTS) — Node 24's bundled corepack crashes launching pnpm
# (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING). pnpm is installed via npm (not
# corepack) to sidestep that class of bug entirely.
FROM node:22-slim

# pnpm without corepack.
RUN npm install -g pnpm@11.9.0

WORKDIR /app

# Manifests first, so `pnpm install` is cached unless deps change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile

# Source, then build all packages (web -> web/dist, server -> server/dist with
# the shared package bundled in by tsup).
COPY . .
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000

# The host (Railway) injects PORT; HOST defaults to 0.0.0.0 in index.ts.
CMD ["node", "packages/server/dist/index.js"]
