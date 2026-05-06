# Getting Started

A working development environment in five commands.

## Prerequisites

- **Node.js 22+**
- **pnpm 10.32.1** (pinned via `packageManager`; `corepack enable` picks it up automatically)
- **Java 21** + [jenv](https://www.jenv.be/) (only needed to build the Kotlin history plugins)
- **Docker** (for Camunda + ClickHouse)
- Access to the private `vendor/mcp-toolkit` submodule

## Clone and install

```bash
git clone --recursive git@github.com:miragon/miragon-ai.git
cd miragon-ai
pnpm install
```

If you forgot `--recursive`, run `git submodule update --init --recursive`.

## Start the infrastructure

The default Compose stack brings up CIB Seven, ClickHouse, OTEL collector, Jaeger, and WireMock — but **not** the Node MCP server, so port `3010` stays free for `pnpm dev`.

```bash
docker compose -f docker/docker-compose.yml up -d
```

## Run the server

```bash
pnpm dev
```

This starts the Miravelo upstream on `:4002` and the MCP server on `:3010`.
Connect any MCP host to `http://localhost:3010` and call a tool.

## Common tasks

| Command                       | What it does                    |
| ----------------------------- | ------------------------------- |
| `pnpm build`                  | Turbo build across the monorepo |
| `pnpm typecheck`              | TypeScript across all packages  |
| `pnpm test`                   | Vitest across all packages      |
| `pnpm lint` / `pnpm lint:fix` | ESLint                          |
| `pnpm format`                 | Prettier                        |
| `pnpm docs:dev`               | Run this docs site locally      |

## Documentation

- **You're reading it.** Edit any page under `docs/` and `pnpm docs:dev` hot-reloads.
- The root [`README.md`](https://github.com/miragon/miragon-ai/blob/main/README.md) keeps deep setup notes (Java/jenv quirks, Kotlin plugin builds, troubleshooting).
