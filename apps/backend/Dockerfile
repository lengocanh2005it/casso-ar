# ---- deps: install workspace dependencies for the build ----
FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile shared types and backend ----
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /repo/apps/backend/node_modules ./apps/backend/node_modules
COPY . .
RUN pnpm --filter @casso-ar/shared-types build
RUN pnpm --filter @casso-ar/backend build

# ---- prod-deps: install production-only workspace dependencies ----
FROM node:22-alpine AS prod-deps
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY . .

# ---- runtime: production dependencies plus compiled output ----
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /repo/packages/shared-types ./packages/shared-types
COPY --from=build /repo/apps/backend/dist ./apps/backend/dist
COPY --from=build /repo/apps/backend/package.json ./apps/backend/package.json
# avatars + email-template attachments are written to WORKDIR/uploads at
# runtime (upload-avatar.ts / local-disk-attachment-storage.adapter.ts mkdir).
# Pre-create the tree and hand it to the unprivileged user before USER node,
# else the node uid can't mkdir/write into the root-owned /repo.
RUN mkdir -p uploads/avatars uploads/email-template-attachments \
  && chown -R node:node uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "apps/backend/dist/main.js"]
