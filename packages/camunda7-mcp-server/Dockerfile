FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./

# Copy all packages
COPY packages/shared/package.json packages/shared/
COPY packages/engine-adapter/package.json packages/engine-adapter/
COPY packages/camunda7-mcp-server/package.json packages/camunda7-mcp-server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/engine-adapter/ packages/engine-adapter/
COPY packages/camunda7-mcp-server/ packages/camunda7-mcp-server/

# Build
RUN pnpm --filter @camunda7-mcp/shared build && \
    pnpm --filter @camunda7-mcp/engine-adapter build && \
    pnpm --filter @camunda7-mcp/server build

# Production stage
FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/engine-adapter/package.json packages/engine-adapter/
COPY --from=builder /app/packages/engine-adapter/dist/ packages/engine-adapter/dist/
COPY --from=builder /app/packages/camunda7-mcp-server/package.json packages/camunda7-mcp-server/
COPY --from=builder /app/packages/camunda7-mcp-server/dist/ packages/camunda7-mcp-server/dist/

RUN pnpm install --frozen-lockfile --prod

ENV ENGINE_TYPE=cibseven
ENV ENGINE_BASE_URL=http://localhost:8080/engine-rest
ENV ENGINE_AUTH_TYPE=basic
ENV ENGINE_USERNAME=demo
ENV ENGINE_PASSWORD=demo

EXPOSE 3100

CMD ["node", "packages/camunda7-mcp-server/dist/index.js"]
