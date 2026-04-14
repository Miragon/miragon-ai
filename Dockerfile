# syntax=docker/dockerfile:1.7
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV TURBO_NO_UPDATE_NOTIFIER=1

FROM base AS build
WORKDIR /app

COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY cibseve-open-api-doc.json ./
COPY packages/ packages/
COPY modules/ modules/
COPY server/ server/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline

RUN --mount=type=cache,id=turbo-server,target=/app/.turbo \
    pnpm turbo build --filter=@automation-mcp/server...

RUN pnpm --filter @automation-mcp/server deploy --prod /app/deployed

FROM base AS runtime
WORKDIR /app
COPY --from=build /app/deployed .
COPY --from=build /app/server/dist ./dist

ENV NODE_ENV=production
EXPOSE 3010
CMD ["node", "dist/index.js"]
