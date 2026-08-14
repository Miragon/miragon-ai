---
name: add-widget
description: Step-by-step house pattern for adding an interactive widget to a module — the React component built from the widget-shell kit, the `show_*` widget tool, the app-only `*_data` feed, and the four-link registration chain. Use whenever adding or changing widgets, `show_*` tools, `*_data` feeds, in-widget data fetching, or when debugging a widget that renders empty, unstyled, or hangs on "Loading…".
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# add-widget — an interactive widget in your module

**Reference implementation: the notes widget** — `modules/mcp-notes/src/widgets/notes-list.tsx`
(component), `widgets/index.ts` (component map), `definition.ts` (catalogue),
`widget-tools.ts` (show tool + data feed), `tool-names.ts` (rename safety).
Richer patterns (paged lists, KPI grids, BPMN viewers, settings cards) live in
`node_modules/@miragon-ai/{camunda7,analytics}-connector/src/widgets/`.

## Step 0 — pick the render path

| You need…                                | Path                                                          |
| ---------------------------------------- | ------------------------------------------------------------- |
| JSON data for the model                  | Plain registrar tool in `src/tools.ts` — no widget, stop here |
| A widget rendered for the user + summary | `<module>_show_<thing>` widget tool in `src/widget-tools.ts`  |
| App-only JSON for in-widget refresh/nav  | `<module>_<thing>_data` feed in `src/widget-tools.ts`         |

A widget almost always means **both** widget-path tools: the `show_*` tool
renders it; the `*_data` feed powers its self-fetch. The `_show_`/`_data`
**naming is load-bearing**: `server/test/widget-contract.e2e.test.ts` asserts
the widget `_meta` contract by name across all composed modules.

## Step 1 — the component

Widgets live in `src/widgets/` and receive their payload as a `data` prop.
Compose them from the shared kit `@miragon-ai/widget-shell/widgets` — never
re-inline its primitives:

- `WidgetShell` (container), `WidgetHeader` (icon/title/sub), `Section`
- Tables: `Th`/`Td`/`TableEmptyState` (rows stay hand-composed `<tr>` + `Td`);
  KPI strips: `KpiGrid`
- Self-fetch fallback: `QueryFallback` + `TableSkeleton` — a missing `isError`
  branch means an eternal skeleton
- Formatting: `formatTimestamp`/`formatDate`/`formatTime`/`formatDuration`/
  `truncate` — no local date/duration helpers, no `Intl.DateTimeFormat`/
  `toLocaleDateString` in widget code
- Long paged lists: `usePagedListView` + `ListTable` + `PagedListFooter` (the
  feed must accept `firstResult`/`maxResults` and return an honest total)

Self-fetch rule (see `NotesListWidget`): fetch via `useToolQuery` against the
**`*_data` feed, never the `show_*` tool** (the host would render its result as
a second widget instead of returning JSON), with `{ enabled: !initialData }` so
a render through the show tool doesn't double-fetch. Import the tool name from
`src/tool-names.ts`.

## Step 2 — the four-link registration chain

Every widget appears in four places — **miss one and it is silently absent
somewhere** (no build error):

1. `src/widgets/index.ts` — component map:
   `"<module>:<widget>": adaptDataWidget(Widget, "<module>:<dataType>", describeForModel)`.
   The `describeForModel` callback is the model's context line ("what is the
   user looking at") — always provide it.
2. `src/definition.ts` — catalogue entry (`id`, `description`, `requires`,
   `consumes`, `size`). Links 1↔2 are guarded by the module's
   `widgets/catalogue-sync.test.ts`.
3. `server/src/ui/widget-registry.ts` — your module's spread must reach the
   host bundle map; guarded by `server/test/widget-registry.test.ts`.
4. `src/tool-names.ts` — a constant for every `show_*`/`*_data` tool referenced
   from widget code, so a rename trips TS at every call site.

New module (not just a new widget)? The Tailwind `@source` entry in
`server/src/ui/globals.css` must cover your widget sources — missing means
silently unstyled (see the create-module skill, Step 6).

## Step 3 — the widget tools (`src/widget-tools.ts`)

This file is the documented exception that calls `server.tool()` directly.
Model both tools on `modules/mcp-notes/src/widget-tools.ts`:

- **`show_*` tool**: spread `...showToolBinding(name, title)` (from
  `@miragon-ai/widget-shell/server`) — it binds the mcp-use view, the
  passthrough `outputSchema`, and the Apps-SDK `_meta` half. **Never hand-write
  `_meta.ui.*` keys**; mcp-use owns and overwrites that namespace. Return
  `buildSingleWidgetView({ widget, app, dataType, data, title, summary })` —
  `summary` is the model-facing channel (1–2 sentences, key figures, pointer to
  the plain tool for raw data); the full payload travels only in
  `structuredContent`.
- **`*_data` feed**: spread `...appOnly` (native `visibility: "app"` +
  `openai/widgetAccessible`, **no** view binding) and return
  `buildDataFeedResult(data)` — so the in-widget `callTool()` gets JSON back
  instead of the host rendering a new widget.
- Wrap every handler in `withToolErrors` (all from
  `@miragon-ai/widget-shell/server`).
- Share the input shape between the pair (one `const <thing>InputShape`), so
  the widget can re-issue the show tool's arguments against the feed.
- A widget-path tool that performs a **durable write** must honor the module's
  toolset itself (the registrar's filter never sees it) — see the
  add-settings-section skill and
  `node_modules/@miragon-ai/analytics-connector/src/settings-tools.ts`.

## Step 4 — verify

```bash
pnpm build && pnpm typecheck && pnpm test
```

- `pnpm typecheck` is the **only** automated check that type-checks widget
  `.tsx` code — never skip it.
- `pnpm test` runs the guard tests for links 1–3 plus the wire-contract e2e
  (naming, `_meta`, app-only visibility). If one fails it names exactly the
  missing link — fix the link, never the test.

Then a manual render check (widget rendering is not covered by any automated
test): `pnpm dev`, call your `show_*` tool in the inspector at
`http://localhost:8400/inspector`, and exercise the widget's self-fetch (e.g.
change a filter) so the `*_data` path runs too. The widget bundle is read once
at boot — rebuild + restart to see changes, or run
`pnpm --filter ./server dev:ui` in a second terminal for rebuild-on-save
(restart still required to serve the new bundle).

## Troubleshooting

| Symptom                              | Cause                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Widget renders as an empty slot      | link 3 missing (module spread not in `server/src/ui/widget-registry.ts`) — the guard test names the id                        |
| Widget renders unstyled              | Tailwind `@source` entry for the module missing in `server/src/ui/globals.css`                                                |
| Hangs on "Loading…" forever          | `resolve.dedupe` trimmed in `server/vite.config.ts` (duplicate React contexts), or a missing `isError` branch in the fallback |
| Self-fetch renders a second widget   | the widget calls the `show_*` tool instead of the `*_data` feed                                                               |
| e2e test fails on `_meta`/visibility | tool name breaks the `_show_`/`_data` convention, or a hand-written `_meta.ui` key — use the helpers                          |
| Old UI after an edit                 | bundle is read once at boot — rebuild and restart `pnpm dev`                                                                  |
