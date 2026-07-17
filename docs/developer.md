# Getting Started

A working development environment in five commands — or zero, if you start
with the hosted playground.

## Try it first — no install

Point any MCP client at the [playground](https://miragon-ai-playground.fly.dev/mcp)
(`https://miragon-ai-playground.fly.dev/mcp`): a seeded engine, live traffic,
and the full analytics stack. See [Connect your Claude in 30 seconds](/#connect-your-claude).
Everything below is for running your own stack.

## Prerequisites

- **Node.js 22+**
- **pnpm 10.32.1** (pinned via `packageManager`; `corepack enable` picks it up automatically)
- **Java 21** + [jenv](https://www.jenv.be/) (only needed to build the Kotlin engine plugins)
- **Docker** (for Camunda, the OTEL Collector, and Prometheus)
- A GitHub PAT with `read:packages` scope (for the private `@miragon/mcp-toolkit-*` packages on GitHub Packages — see the [root README](https://github.com/miragon/miragon-ai/blob/main/README.md#setup) for the token setup)

## Clone and install

```bash
export GITHUB_TOKEN=ghp_xxx   # PAT with read:packages
git clone git@github.com:miragon/miragon-ai.git
cd miragon-ai
pnpm install
```

## Start the infrastructure

The default Compose stack brings up CIB Seven, the OTEL Collector, Prometheus, and Grafana — but **not** the Node MCP gateway, so port `8400` stays free for `pnpm dev`.

```bash
docker compose -f playground/docker/docker-compose.yml up -d
```

## Run the gateway

```bash
cp .env.example .env   # dev defaults: engine on :8410, Prometheus on :8460
pnpm dev
```

This starts the MCP gateway on `:8400`.
Connect any MCP host to `http://localhost:8400` and call a tool.

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
