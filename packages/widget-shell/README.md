# @miragon-ai/widget-shell

Shared widget plumbing for the [Miragon AI](../../README.md) MCP App widgets. It is the common base
both widget modules ([`mcp-camunda7`](../mcp-camunda7), [`mcp-analytics`](../mcp-analytics)) build on,
so every widget gets the same data-loading, refresh and view-composition behaviour.

`private` and not published to npm — an internal monorepo package.

## What it provides

- **`adaptDataWidget`** (`./ui`) — wraps a presentational React component into a data-aware widget:
  handles the initial structured-content payload, in-widget `callTool()` refresh via the `*_data`
  feeds, and loading / error states. This is what keeps widgets rename-safe and refreshable.
- **View builders** (`./server`) — `buildSingleWidgetView`, `buildComposedView` and
  `buildDataFeedResult` (the single implementation of the app-only `*_data` feed result), the
  server-side helpers that assemble a widget tool's `{ widget, data }` result and `_meta.ui` wiring.
- **The `shell:*` catalogue** (`./server`) — `shellDefinition` + `createShellPlugin` register the
  always-on generic `shell:kpi-grid` / `shell:data-table` widgets (components in `./widgets`), the
  standard `render-view`/builder composition targets fed via `props.dataKey`. Apps own no domain UI,
  so the catalogue lives here.
- **Shared UI primitives** (`./widgets`) — common components (`WidgetShell`, tables, formatters,
  `useApplyTheme`, …) and `with-tool-errors` handling reused across both widget packages.

## Exports

| Subpath     | Contents                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| `./server`  | `buildSingleWidgetView` / `buildComposedView` / `buildDataFeedResult` + `shellDefinition`/`createShellPlugin` |
| `./ui`      | `adaptDataWidget` — the data-aware widget wrapper                                                             |
| `./widgets` | Shared widget UI primitives incl. the generic `shell:*` components and `useApplyTheme`                        |

The `@miragon/mcp-toolkit-*`, React and `@tanstack/react-query` deps are **peer dependencies** — they
must resolve to a single instance across the host bundle (see the `dedupe` array in the server app's
`vite.config.ts`), otherwise the React contexts diverge and in-widget queries hang.

## Where it fits

```
mcp-camunda7 / mcp-analytics widgets
            │  use
            ▼
   @miragon-ai/widget-shell   ──  adaptDataWidget · view builders · UI primitives
            │  build on
            ▼
   @miragon/mcp-toolkit-ui (React + react-query)
```

See the architecture invariants in [`CLAUDE.md`](../../CLAUDE.md) for the four-link widget
registration chain.
