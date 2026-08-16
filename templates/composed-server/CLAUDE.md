# CLAUDE.md

Guidance for AI agents working in this repository — a composed MCP server built
from the published `@miragon-ai` modules (camunda7 BPM operations, Prometheus
process analytics) plus your own custom modules. `README.md` is the quick tour
for humans; this file plus the skills carry the architecture rules.

The skills in `.claude/skills/` are step-by-step walkthroughs for the four main
task paths — read the matching one BEFORE starting:

| Skill                  | Use when…                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `setup-server`         | configuring, running, branding, or deploying this server (env, modules, toolsets, Docker)       |
| `create-module`        | building your own connector module — tools for your own API or system                           |
| `add-widget`           | adding or changing an interactive widget (`show_*` tool + `*_data` feed + React component)      |
| `add-settings-section` | persisting per-user preferences for a module (a `profile.modules.<module>` slice + tool triple) |

## Commands

```bash
pnpm install          # public npm registry only — no credentials needed
cp .env.example .env  # local config; `pnpm dev` loads it (only `pnpm dev` does)

pnpm build            # modules → widget bundle → server
pnpm typecheck        # tsc everywhere, INCLUDING widget .tsx code — the only check that covers it
pnpm test             # vitest: guard tests + in-process e2e wire-contract tests
pnpm dev              # MCP endpoint on :8400/mcp, inspector on :8400/mcp/inspector

docker build -t my-mcp-server .   # needs a committed pnpm-lock.yaml
```

Use the inspector (`http://localhost:8400/mcp/inspector`, `pnpm dev` only) to call
tools and render widgets manually — `notes_show_notes` works without any
external infrastructure.

## Architecture invariants (short form — details in the skills)

1. **Modules are self-contained peers; the server is a thin composition root.**
   A module is a package exporting a `ModuleDefinition` (the port type in
   `server/src/setup.ts` — conformance is structural, modules never import
   the server or each other). Wiring a module touches the server in three
   places (`MODULES` in `setup.ts`, the spread in `ui/widget-registry.ts`,
   the definition in `test/widget-registry.test.ts`) plus the `workspace:*`
   dependency — the `create-module` skill walks through all of them. Tailwind
   scans workspace modules via the `modules/*/src` glob in `ui/globals.css`;
   only npm-installed module packages need their own `@source` line.
2. **Plain tools go through `createToolRegistrar`, never raw `server.tool()`** —
   the raw path is reserved for widget tools (`widget-tools.ts`). Three render
   paths: registrar tools (JSON for the model), `*_show_*` widget tools
   (widget for the user + summary for the model), app-only `*_data` feeds
   (JSON for in-widget self-fetch). The `_show_`/`_data` **naming is
   load-bearing**: `server/test/widget-contract.e2e.test.ts` asserts the widget
   `_meta` contract by name across ALL composed modules, including yours.
3. **Widgets hang off a four-link chain** (component map → module catalogue →
   server registry → `tool-names.ts`); a missed link is a SILENTLY absent
   widget. Guarded by each module's `catalogue-sync.test.ts` and the server's
   `widget-registry.test.ts`.
4. **`resolve.dedupe` in `server/vite.config.ts` is load-bearing — never trim
   it.** Without it every in-widget query hangs on "Loading…" (duplicate React
   contexts).
5. **Exact version pins** (`save-exact` in `.npmrc`): upgrade all
   `@miragon-ai/*` packages together to one version; keep
   `@miragon/mcp-toolkit-*` and `mcp-use` at the versions the `@miragon-ai`
   packages pin. `@mcp-use/client` (a dev dependency of `server/`) is
   pre-pinned to the newest version mcp-use's optional peer range accepts, so
   the mcp-use CLI's on-demand install can never mutate `package.json`
   mid-task or introduce a second, differently-resolved mcp-use instance — on
   an mcp-use bump, re-pin it to the newest version the new peer range
   accepts.
6. **Never hand-write `_meta.ui.*` keys** — spread `showToolBinding(...)` for
   widget tools and `appOnly` for data feeds (both from
   `@miragon-ai/widget-shell/server`); mcp-use owns and overwrites the `ui`
   namespace.
7. **`.env.example` documents every env var the server reads** — both drift
   directions are guarded by `server/test/env-example.test.ts`; add your
   module's vars there.

## Verification

The minimum bar for every change:

```bash
pnpm build && pnpm typecheck && pnpm test
```

`pnpm typecheck` is the **only** automated check that type-checks widget `.tsx`
code — never skip it. Widget changes additionally need a render check
(`pnpm dev`, then call the `show_*` tool). The widget bundle is read once at
boot, and the root `pnpm dev` rebuilds the modules and the bundle on every
start — the whole edit-run loop for module or widget code is: restart
`pnpm dev` at the repo root (the server-local `dev` script rebuilds only the
bundle and loads no `.env`).

The render check runs headless with the stock mcp-use CLI (needs a local
Chrome; the inspector at `http://localhost:8400/mcp/inspector` is the
human/no-Chrome path). With `pnpm dev` running, from `server/`:

```bash
pnpm exec mcp-use client connect local http://localhost:8400/mcp  # once
pnpm exec mcp-use client local tools call notes_show_notes        # wire check: _meta.ui.resourceUri + structuredContent
pnpm exec mcp-use screenshot --mcp http://localhost:8400/mcp \
  --tool notes_show_notes --output /tmp/notes.png --json          # renders the REAL bundle at OpenAI's 768px container width
```

Then read the PNG: a styled widget proves the bundle, the registry links, and
the Tailwind scan in one shot.

## Reference code

- `modules/mcp-notes/` — the example custom module showing the full house
  pattern (module definition, registrar tool, widget tool + data feed, widget,
  guard test). Copy it; don't invent a new shape.
- The published Miragon modules ship their **sources**: read
  `node_modules/@miragon-ai/camunda7-connector/src/` and
  `node_modules/@miragon-ai/analytics-connector/src/` for the reference
  implementations of anything the notes module doesn't cover (toolsets,
  settings sections, paged lists, BPMN widgets).
