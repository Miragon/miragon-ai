# syntax=docker/dockerfile:1.7
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV TURBO_NO_UPDATE_NOTIFIER=1
ENV CI=true

FROM base AS build
WORKDIR /app

# .npmrc resolves ${GITHUB_TOKEN} for npm.pkg.github.com (private @miragon
# packages). The token is mounted as a BuildKit secret per RUN step — never
# an ARG/ENV — so it cannot leak into image layers.
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

# pnpm resolves .npmrc on every invocation; mount the secret here too so the
# ${GITHUB_TOKEN} interpolation never fails, regardless of pnpm version.
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
CMD ["node", "dist/index.js"]
