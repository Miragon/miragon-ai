# @miragon-ai/widget-shell

Shared widget plumbing for the [Miragon AI](../../../README.md) MCP App widgets. It is the common base
both widget modules ([`camunda7-connector`](../../connectors/camunda/camunda7-connector), [`analytics-connector`](../../connectors/analytics/analytics-connector)) build on,
so every widget gets the same data-loading, refresh and view-composition behaviour.

Published to the public npm registry as `@miragon-ai/widget-shell` — the foundation
package customers build their own connectors and composed servers on (see the
`composed-server` template).

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
- **Module composition** (`./server`) — `composeModules` is the composition-root machinery every
  server shares: `MCP_ACTIVE_MODULES` selection with `module:toolset` suffixes, the env-typo warner
  and boot warnings. `resolveBoot(env, { authenticated })` resolves ONE concrete toolset per module
  per boot and threads it into the module's `config.toolset`; pass `authenticated: true` only when
  your server actually installed OAuth. `logEffectiveToolsets(boot)` prints the one boot line that
  states each module's toolset and why, and `frameworkWritesAllowed(boot)` decides whether
  framework writes no module toolset filters (the toolkit's dashboard builder) may be registered —
  only with OAuth and no module on its read-only floor (a module still on the deprecated
  `supportsToolsets` pass-through counts as restricted).
- **Toolset vocabularies** (`./server`) — a module declares its toolsets as
  `toolsets: createToolsetVocabulary(module, names, floor, { authenticatedDefault })` on its
  definition (the boolean `supportsToolsets` is deprecated). The rule is fail-closed: no suffix →
  `floor` without OAuth, `authenticatedDefault` (default: `floor`) with it; an empty or unknown
  suffix → `floor` with a warning; `resolve(undefined)` → `floor`. Nothing resolves to
  "everything" — a module's widest toolset is reachable only by naming it — and
  `allowsDurableWrites(toolset)` is true for every toolset above the floor.
- **Server boot** (`./server`) — `createComposedServer({ label, info, composition, bundle, setup,
oauth? })` is the one boot sequence every composed server shares: env-typo warnings, the HTTP
  edge policy, ONE `resolveBoot` (authenticated exactly when you pass the OAuth provider you
  install), the boot log, your `setup(boot)` (plugins + persistence), `createFrameworkApp` with
  `serverInfo`/`instructions`, request context, tool-call logging, `/metrics` (optional
  `MCP_METRICS_TOKEN`), the Host/Origin guard and `/health/*`. `mcp-use dev` serves the returned
  `app`; production calls `listen({ handleSignals: true })` — mcp-use's `toNodeHandler` behind a
  request-body cap (`MCP_MAX_BODY_BYTES`, 413 before buffering), an in-flight body budget of 4×
  the cap (503) and a 30 s request timeout, plus a graceful drain (stop accepting, in-flight
  requests finish — readiness 503 `draining` — then your `runtime.shutdown()`). The guard is
  DNS-rebinding protection: `Host` (and a POST's `Origin`) must be localhost-class, `MCP_URL`'s or
  in `MCP_ALLOWED_HOSTS`/`MCP_ALLOWED_ORIGINS` (spread `HTTP_EDGE_ENV_VARS` into your known vars);
  `/health*` and `/metrics` stay reachable by IP for probes and scrapers.
- **Persistence** (`./server`) — the user-profile store (in-memory / filesystem / Postgres) and the
  Postgres `DashboardStore` for the toolkit's saved dashboards, plus the `createSql` client and the
  `runMigrations` runner that applies each store's own `Migration[]` (`PROFILE_STORE_MIGRATIONS`,
  `DASHBOARD_STORE_MIGRATIONS`) under an advisory lock. A composed server picks its backends from
  its own env and injects them — it does not reimplement the stores. `postgres` is an **optional**
  peer dependency: the driver is loaded through a dynamic import inside `createSql`, so servers
  persisting to disk or memory never need it installed.

## Exports

| Subpath     | Contents                                                                                                                                                                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./server`  | `buildSingleWidgetView` / `buildComposedView` / `buildDataFeedResult`, `shellDefinition`/`createShellPlugin`, `composeModules` / `frameworkWritesAllowed` / `createToolsetVocabulary`, `createComposedServer` and its edge pieces, the profile + dashboard stores and the Postgres client/migration runner |
| `./ui`      | `adaptDataWidget` — the data-aware widget wrapper                                                                                                                                                                                                                                                          |
| `./widgets` | Shared widget UI primitives incl. the generic `shell:*` components and `useApplyTheme`                                                                                                                                                                                                                     |

The `@miragon/mcp-toolkit-*`, `react`/`react-dom`, `zod` and `@tanstack/react-query` deps are
**peer dependencies** — they must resolve to a single instance across the host bundle (see the
`dedupe` array in the server app's `vite.config.ts`), otherwise the React contexts diverge and
in-widget queries hang. They are published as ranges (`react`/`react-dom` `^19.2.0`, `zod`
`^4.4.0`, `@miragon/mcp-toolkit-*` `~2.6.0`) so they dedupe against your app's copy.

`mcp-use` is the exception: it is an **exactly pinned** peer dependency — pin it to `mcp-use@2.7.3`
in your app. A duplicate `mcp-use` instance breaks the React context and hangs every in-widget query
on "Loading…".

## Where it fits

```
camunda7-connector / analytics-connector widgets
            │  use
            ▼
   @miragon-ai/widget-shell   ──  adaptDataWidget · view builders · UI primitives
            │  build on
            ▼
   @miragon/mcp-toolkit-ui (React + react-query)
```

See the architecture invariants in [`CLAUDE.md`](../../../CLAUDE.md) for the four-link widget
registration chain.
