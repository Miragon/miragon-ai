# syntax=docker/dockerfile:1.7
# Mirrors the stock miragon-ai server image (two-stage pnpm build). Requires a
# committed pnpm-lock.yaml — run `pnpm install` once and commit the lockfile.

FROM node:26-slim AS base

RUN npm install -g pnpm@10.32.1
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true

FROM base AS build
WORKDIR /app

COPY pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

COPY package.json pnpm-workspace.yaml ./
COPY server/ server/
COPY modules/ modules/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline

RUN pnpm run build

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @acme/composed-mcp-server deploy --prod --legacy /app/deployed

FROM base AS runtime
WORKDIR /app
COPY --from=build /app/deployed .
COPY --from=build /app/server/dist ./dist

ENV NODE_ENV=production
EXPOSE 8400

USER node

# Liveness: succeed once the server is accepting TCP connections on 8400.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('net').connect(8400,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
