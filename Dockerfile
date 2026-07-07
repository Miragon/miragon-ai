# syntax=docker/dockerfile:1.7

FROM node:26-slim@sha256:a1d9d671994fc2d26e297ac56b4b1522a8bc7fa71c43b14cd1b1fe6c5116f7dc AS base

RUN npm install -g pnpm@10.32.1
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV TURBO_NO_UPDATE_NOTIFIER=1
ENV CI=true

FROM base AS build
WORKDIR /app

COPY pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=github_token \
    GITHUB_TOKEN=$(cat /run/secrets/github_token) pnpm fetch

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/ apps/
COPY packages/ packages/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=github_token \
    GITHUB_TOKEN=$(cat /run/secrets/github_token) pnpm install --frozen-lockfile --offline

RUN --mount=type=cache,id=turbo-server,target=/app/.turbo \
    --mount=type=secret,id=github_token \
    GITHUB_TOKEN=$(cat /run/secrets/github_token) pnpm turbo build --filter=@miragon-ai/mcp-gateway...

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=github_token \
    GITHUB_TOKEN=$(cat /run/secrets/github_token) \
    pnpm --filter @miragon-ai/mcp-gateway deploy --prod --legacy /app/deployed

FROM base AS runtime
WORKDIR /app
COPY --from=build /app/deployed .
COPY --from=build /app/apps/mcp-gateway/dist ./dist

ENV NODE_ENV=production
EXPOSE 8400

USER node

# Liveness: succeed once the gateway is accepting TCP connections on 8400.
# Port-level check avoids coupling to a specific HTTP route.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('net').connect(8400,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
