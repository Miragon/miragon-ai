# @miragon-ai/mcp-camunda7

The **camunda7 module** for [Miragon AI](../../README.md): Camunda 7 / CIB Seven BPM operations as
`camunda7_*` MCP tools, plus the interactive cockpit widgets (MCP Apps). Built on
[`@miragon-ai/client-camunda7`](../client-camunda7) and the `@miragon/mcp-toolkit-*` packages.

The server loads this module as `camunda7` via `camunda7Module` (`src/module.ts`), which conforms
structurally to the app's `ModuleDefinition` port. The package is `private` and not published to npm.

## What it provides

- **Operations tools** (`src/tools/`) — one file per domain (`process-instances`, `tasks`,
  `incidents`, `jobs`, `history`, …), registered through `createToolRegistrar`. Plain JSON for the
  model.
- **Widget tools** (`src/widget-tools.ts`) — `show_*` tools that render a cockpit widget for the user
  and return a compact summary for the model, plus app-only `*_data` feeds for in-widget refresh and
  navigation.
- **Widgets** (`src/widgets/`) — React components (cockpit dashboard, process & incident panels, BPMN
  viewer, history timeline, job panel) wired in `registry.ts` via `adaptDataWidget`.
- **Multi-engine routing** — every tool resolves its engine through `withEngine` / `resolveEngine`
  (`src/lib/`): per-call override → sticky session selection → single configured default.
- **Engine providers** (`src/engine-provider.ts`, `src/providers/`) — each engine entry carries a
  vendor `flavor` (`cibseven` | `operaton` | `camunda7`, default `cibseven`) resolved to an
  `EngineProvider` holding only the real vendor differences: cockpit routes, branding, client hook.
  Mixed-vendor fleets run in one server.
- **Toolset filtering** — `src/lib/toolsets.ts` narrows the surface to `read-only` / `operations` /
  `admin`.

## Adding a tool or widget

This module has strict house patterns — read the
[`add-bpm-feature`](../../.claude/skills/add-bpm-feature) skill and the architecture invariants in
[`CLAUDE.md`](../../CLAUDE.md) before adding tools, schemas, or widgets. In short: input schemas live
in [`@miragon-ai/client-camunda7`](../client-camunda7), tools register via the registrar (never raw
`server.tool()`), and a widget must be wired across all four registration links.

## Layout

| Path                     | Contents                                                                  |
| ------------------------ | ------------------------------------------------------------------------- |
| `src/tools/`             | Registrar operations tools, one file per domain (`index.ts` wires them)   |
| `src/widget-tools.ts`    | `show_*` widget tools and `*_data` feeds                                  |
| `src/widgets/`           | React widgets + `registry.ts` (component → dataType)                      |
| `src/definition.ts`      | Widget metadata (`id`, `requires`, `size`, `propsSchema`)                 |
| `src/tool-names.ts`      | Tool-name constants for rename-safe in-widget navigation                  |
| `src/lib/`               | `with-engine.ts` (engine routing), `cockpit-url.ts`, `toolsets.ts`        |
| `src/module.ts`          | `camunda7Module` (config schema, env mapping) + `createBpmnXmlFetcher`    |
| `src/engine-provider.ts` | The vendor provider port (`EngineProvider`, `CockpitRef`)                 |
| `src/providers/`         | `cibseven` / `operaton` / `camunda7` providers (cockpit routes, branding) |
| `src/steps/`             | Pipeline steps contributed to the server                                  |

## Verify

`pnpm typecheck` is the **only** check that type-checks the widget `.tsx` (via
`tsconfig.widgets.json`). Widgets render only manually through the inspector — see the root README.
