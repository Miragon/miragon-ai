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

## Clone and install

```bash
git clone git@github.com:miragon/miragon-ai.git
cd miragon-ai
pnpm install
```

## Start the infrastructure

The default Compose stack brings up CIB Seven, the OTEL Collector, Prometheus, and Grafana — but **not** the Node MCP server, so port `8400` stays free for `pnpm dev`.

```bash
docker compose -f playground/docker/docker-compose.yml up -d
```

## Run the server

```bash
cp .env.example .env   # dev defaults: engine on :8410, Prometheus on :8460
pnpm dev
```

This starts the MCP server on `:8400`.
Connect any MCP host to `http://localhost:8400/mcp` and call a tool.

## Common tasks

| Command                       | What it does                    |
| ----------------------------- | ------------------------------- |
| `pnpm build`                  | Turbo build across the monorepo |
| `pnpm typecheck`              | TypeScript across all packages  |
| `pnpm test`                   | Vitest across all packages      |
| `pnpm lint` / `pnpm lint:fix` | ESLint                          |
| `pnpm format`                 | Prettier                        |
| `pnpm docs:dev`               | Run this docs site locally      |

## Build your own server

The modules ship on public npm — `@miragon-ai/mcp-camunda7`,
`@miragon-ai/mcp-analytics`, `@miragon-ai/widget-shell` plus the two client
packages, released in lockstep (pin one version across all of them).
[`templates/composed-server/`](https://github.com/Miragon/miragon-ai/tree/main/templates/composed-server)
is a ready-to-copy pnpm workspace that composes them with an example custom
module (tools, widget, guard tests included); its `README.md` documents the
module contract and the invariants. CI runs the template against the
workspace's packed packages on every change (`scripts/test-template.sh`).
Each release also syncs it — tested against the published packages, with a
committed lockfile — to the read-only mirror
[`Miragon/miragon-ai-starter`](https://github.com/Miragon/miragon-ai-starter)
("Use this template" ready; contribute here, not there).

## Documentation

- **You're reading it.** Edit any page under `docs/` and `pnpm docs:dev` hot-reloads.
- The root [`README.md`](https://github.com/miragon/miragon-ai/blob/main/README.md) keeps deep setup notes (Java/jenv quirks, Kotlin plugin builds, troubleshooting).
