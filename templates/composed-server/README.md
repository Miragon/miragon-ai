# Miragon AI Starter

Build your own MCP server on the published `@miragon-ai` modules — Camunda 7 /
CIB Seven BPM operations and Prometheus-backed process analytics, both with
interactive widgets — and add modules for your own systems.
`modules/mcp-notes` is a small example module that shows the whole pattern;
copying it is how you start yours.

Everything installs from the public npm registry — no credentials needed.

## Quickstart

```bash
pnpm install
cp .env.example .env  # engine + Prometheus URLs; `pnpm dev` loads it
pnpm build
pnpm dev              # MCP endpoint on :8400/mcp, inspector on :8400/inspector
```

Open the inspector at `http://localhost:8400/inspector` and call
`notes_show_notes` — the example widget renders with no external systems.
The camunda7/analytics tools need a running engine and Prometheus; the
[miragon-ai playground](https://github.com/Miragon/miragon-ai/tree/main/playground)
ships a ready-made Docker Compose stack whose URLs match `.env.example`.

## Built for AI-assisted development

Open this repo in Claude Code (or any agent that reads `CLAUDE.md`) and
describe what you want — the skills in `.claude/skills/` walk the agent
through the four common tasks step by step:

| Skill                  | For…                                                   |
| ---------------------- | ------------------------------------------------------ |
| `setup-server`         | configuring, running, branding, and deploying          |
| `create-module`        | building a connector module for your own API or system |
| `add-widget`           | adding an interactive widget to a module               |
| `add-settings-section` | per-user settings for your module                      |

Everything works the same when done by hand: `CLAUDE.md` is the compact
architecture reference, and the guard tests in `server/test/` catch the
classic wiring mistakes — the ones whose failure mode would otherwise be
silent (a widget rendering empty, unstyled, or not at all).

## Make it yours

1. Rename the `@acme` scope in `server/package.json`,
   `modules/mcp-notes/package.json`, the imports, and the
   `--filter @acme/composed-mcp-server` in the Dockerfile; then re-run
   `pnpm install` to refresh `pnpm-lock.yaml`.
2. Swap the brand tokens (colors, radius, fonts) in
   `server/src/ui/globals.css`.

## Layout

| Path                 | Contents                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `server/`            | The composition root: module list (`src/setup.ts`), widget bundle (`src/ui/`), boot code |
| `server/test/`       | Guard tests — keep them; they cover your modules too                                     |
| `modules/mcp-notes/` | Example module: tools, an interactive widget, and its guard test                         |

## Adding your own module

```bash
cp -R modules/mcp-notes modules/mcp-<name>
```

Rename `notes` to your module name, put your API/SDK access behind the store
interface, and wire the module into the server: the `workspace:*` dependency
in `server/package.json`, the module list, the widget registry, a Tailwind
`@source` line, and its `definition` in the guard test. The `create-module`
skill walks through every step — and the guard tests fail loudly if a wiring
step is missed.

## Configuration

[`.env.example`](.env.example) documents every variable this server reads;
copy it to `.env` (loaded by `pnpm dev` only — `pnpm start` and Docker take
their config from the environment). A variable the server does not read
prints a warning at boot, so typos surface immediately.

| Variable                                     | Effect                                                           |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `PORT`                                       | HTTP port (default 8400)                                         |
| `MCP_URL`                                    | Public base URL (behind a proxy/gateway)                         |
| `MCP_ACTIVE_MODULES`                         | Comma list, e.g. `camunda7:read-only,notes` (default: all)       |
| `MCP_PROFILE_DIR`                            | Filesystem persistence for user profiles (default: in-memory)    |
| `MCP_PROFILE_SESSION_TTL_DAYS`               | Expiry for session-keyed profile records (default 30, `0` = off) |
| `MCP_DASHBOARD_DIR`                          | Filesystem persistence for saved dashboards (default: in-memory) |
| `CAMUNDA_*`, `PROMETHEUS_URL`, `NOTES_TITLE` | Module config — see `.env.example` for the full list             |

## Docker

```bash
pnpm install          # once, then commit pnpm-lock.yaml
docker build -t my-mcp-server .
docker run -p 8400:8400 -e CAMUNDA_BASE_URL=http://host.docker.internal:8080/engine-rest my-mcp-server
```

## Going further

The stock server (`apps/mcp-server-camunda7` in the
[miragon-ai repo](https://github.com/Miragon/miragon-ai)) additionally ships,
and is the reference for: OAuth (Keycloak/Auth0/OIDC), Postgres profile and
dashboard stores for multi-instance deployments, and a Playwright host
simulation of the widget bundle.
