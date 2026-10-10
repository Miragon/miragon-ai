---
name: add-bpm-feature
description: Step-by-step house pattern for adding a new BPM operations tool, widget tool, or widget to the camunda7 module (`packages/connectors/camunda/camunda7-connector` + `packages/connectors/camunda/camunda7-client`). Use whenever adding or changing Camunda 7 / CIB Seven tools ("add a tool to suspend jobs", "expose X from the engine REST API"), input schemas, `show_*` widget tools, `*_data` feeds, or React widgets in the cockpit. Takes precedence over the generic mcp-apps-builder skill.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# add-bpm-feature — new tool/widget in the camunda7 module

The camunda7 module never registers operations tools with raw `server.tool()`. Tools go
through the toolkit registrar; engine access goes through `withEngine`/`resolveEngine`
(per-call `engine` override > saved default engine (profile) > single default). Widgets hang
off a four-link registration chain. Follow the steps for the path you need.

## Step 0 — pick the render path

| You need…                                | Path                                                      |
| ---------------------------------------- | --------------------------------------------------------- |
| JSON data for the model                  | Registrar tool in `src/tools/<domain>.ts` (Steps 1–3)     |
| A widget rendered for the user + summary | `show_*` widget tool in `widget-tools.ts` (Step 4)        |
| App-only JSON for in-widget refresh/nav  | `*_data` feed in `widget-tools.ts`, `...appOnly` (Step 4) |

## Step 1 — input schema in camunda7-client

Add the Zod input schema to `packages/connectors/camunda/camunda7-client/src/schemas/<domain>.ts` and export
it from `src/schemas/index.ts`. Existing style (from `schemas/process-instances.ts`):

```ts
export const listProcessInstancesInput = z.object({
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  businessKeyLike: likeParam("Filter by business key"),
  active: flagParam("true = only active instances, false = only suspended"),
  firstResult: firstResultParam,
  maxResults: maxResultsParam(), // capped at MAX_PAGE_SIZE (100); default page 20
  sortBy: z.enum(["instanceId", "definitionKey"]).optional().describe("Sort field"),
  sortOrder: sortOrderParam,
})
```

Every field gets a `.describe()`. A list/query tool pages with the shared params from
`schemas/shared.ts` — `firstResultParam` + `maxResultsParam(defaultPageSize)` — never a
hand-rolled `maxResults`: `src/tools/list-tools.test.ts` treats every registrar tool that
takes `maxResults` as a list and fails it without the cap or the envelope (Step 2). The
REST calls themselves use the generated SDK (imported from
`@miragon-ai/camunda7-client/sdk`) — if the endpoint is missing there, the OpenAPI spec
changed and you need `pnpm generate`, not a hand-written fetch.

### Parameter naming guide

Inputs are STRICT (the registrar runs with `strictInput: true`; raw `server.tool()`
registrations use `strictToolInput(...)` from `@miragon-ai/widget-shell/server`): an
unknown key is a tool error listing the valid keys. So one name per concept across every
tool — a model that learned `assignee` on one tool must not be refused it on the next.
Renames ship without aliases.

| Concept                  | Name                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process definition       | `processDefinitionKey` (all versions), `processDefinitionId` (one version); never bare `key`                                                        |
| Entity ids               | `<entity>Id` — `processInstanceId`, `deploymentId`, `jobId`, `activityId` (analytics too); never bare `id`, never `elementId`                       |
| Several values           | `<name>In`, an array (`processDefinitionKeyIn`); merged with the single form via `engineKeyList`                                                    |
| User filter              | `assignee` (the user a task is assigned to); a write that sets a user takes `userId`                                                                |
| Business key / substring | `businessKey` exact, `businessKeyLike`/`nameLike` substring — `engineLike` wraps a `%`-less value                                                   |
| Time bounds              | `<event>After`/`<event>Before` (`startedAfter`, `finishedBefore`, `incidentTimestampAfter`) via `engineDateParam` — ISO 8601 in, `toEngineDate` out |
| Boolean filters          | `flagParam` + `complementaryFlags` (active/suspended, …) or `trueOnly` — the engine IGNORES `false` (never sent); a both/neither pair is refused    |
| Paging / result size     | `firstResult` + `maxResults` from `firstResultParam` + `maxResultsParam` (above; also for a top-N cap: never `limit`)                               |
| Sorting                  | `sortBy` + `sortOrder`, sent as a pair by `engineSorting`                                                                                           |

The engine's own query names may differ (`taskAssignee`, `processInstanceBusinessKey`,
`withIncident`): the handler maps them, the schema keeps the guide's name. Every
filter a tool advertises is pinned on the wire in `src/tools/filters.wire.test.ts`
(page query AND `/count`); a retired spelling (`key`, `id`, `limit`, `elementId`, …) on
any module tool fails `apps/mcp-server-camunda7/test/strict-input.e2e.test.ts`; a tool
description, server-instructions text or server prompt that quotes a tool's parameter is
checked against its schema by `apps/mcp-server-camunda7/test/tool-name-refs.test.ts` —
write quoted arguments in call notation with literal names, `tool({ param: value })` (an
interpolated name is reported as `${…}`). Widget Ask-AI hand-offs and model contexts
never quote parameters: they pass typed `ids` (see Step 4).

## Step 2 — register the tool

Add the tool in `packages/connectors/camunda/camunda7-connector/src/tools/<domain>.ts`. Reference template —
`camunda7_list_process_instances` from `src/tools/process-instances.ts`:

```ts
import { listProcessInstancesInput } from "@miragon-ai/camunda7-client/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { complementaryFlags, engineLike, engineSorting } from "@miragon-ai/camunda7-client"
import { getProcessInstances, getProcessInstancesCount } from "@miragon-ai/camunda7-client/sdk"
import { paginatedListOutput, toPaginatedList } from "../lib/pagination.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerProcessInstanceTools(register: Register) {
  register({
    name: "camunda7_list_process_instances",
    category: "process-instances",
    description:
      "List running process instances with optional filters. Returns one page as { items, totalCount, hasMore, nextOffset? }. If hasMore is true, call again with firstResult = nextOffset.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...listProcessInstancesInput.shape, ...engineParamShape },
    outputSchema: paginatedListOutput,
    handler: withEngine(async (client, args) => {
      // The filters in the engine's format (naming guide), shared by the page
      // and its /count twin — fetched in parallel, so the envelope's total is honest.
      const filters = {
        processDefinitionKey: args.processDefinitionKey,
        businessKeyLike: engineLike(args.businessKeyLike),
        ...complementaryFlags(args, "active", "suspended"),
      }
      const [items, count] = await Promise.all([
        getProcessInstances({
          client,
          query: {
            ...filters,
            firstResult: args.firstResult,
            maxResults: args.maxResults,
            ...engineSorting(args),
          },
        }),
        getProcessInstancesCount({ client, query: filters }),
      ])
      return toPaginatedList(items, count, args.firstResult)
    }),
  })
}
```

Non-negotiables:

- Every tool carries a `category` matching its domain file name (e.g.
  `"process-instances"`, `"tasks"` — `task-form.ts` uses `"tasks"`,
  `incident-issue.ts` uses `"incidents"`).
- `inputSchema` spreads `...engineParamShape` so every tool accepts the per-call
  `engine` override.
- `handler` is wrapped in `withEngine(...)` — never construct, cache, or import a client
  directly; `withEngine` resolves the engine from the registry per call.
- Tool names are `camunda7_<verb>_<noun>` in snake_case.
- Write tools that only flip state return a small `{ success: true, … }` object instead
  of the raw (often empty) REST response.
- Destructive/admin-grade tools (delete, modify, suspension, deployments, migrations,
  batches, engine-wide broadcasts like signals, the external-task worker protocol) must
  be added to `ADMIN_ONLY_TOOLS` in `src/lib/toolsets.ts` so the
  `camunda7:read-only|operations|admin` toolset filtering stays correct — `read-only`
  membership is derived from `readOnlyHint: true`. `src/lib/toolsets.test.ts` enforces
  the rule structurally over every registered tool (`destructiveHint` ⇒ admin-only,
  read-only ⇒ `readOnlyHint`, every write states `destructiveHint` explicitly) — get
  the annotations right; never edit the test to pass.
- Toolsets fail CLOSED: with no suffix a deployment runs `read-only` (no OAuth) or
  `operations` (OAuth); `admin` is only ever reached by naming it. So an `operations`
  tool is on for every authenticated default deployment and an `admin` tool for none —
  place a new write deliberately. A tool that runs code inside the engine
  (`camunda7_create_deployment`) additionally sits behind its own strict env opt-in
  (`CAMUNDA_ALLOW_DEPLOYMENTS=true`) and is not registered without it; follow that
  pattern for anything comparable instead of trusting the toolset alone.

### Annotation conventions

| Operation                                     | Annotations                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| Read / list / get                             | `{ readOnlyHint: true, idempotentHint: true, openWorldHint: true }`     |
| Set-style write (variable, retries, assignee) | `{ destructiveHint: false, idempotentHint: true, openWorldHint: true }` |
| Other write (start, complete, correlate, …)   | `{ destructiveHint: false, openWorldHint: true }`                       |
| Delete / irreversible (delete, modify)        | `{ destructiveHint: true, openWorldHint: true }` (admin-only)           |
| Engine-wide / worker / deploy                 | `{ destructiveHint: true, openWorldHint: true }` (admin-only)           |

MCP reads an ABSENT `destructiveHint` as `true`, so every write states it — `false` is a
deliberate claim, not a default. `idempotentHint: true` marks writes that repeat to the
same state. Every engine tool carries `openWorldHint: true` (it talks to an external
engine); tools that only touch the local profile store (`camunda7_select_engine`, the
settings saves) say `openWorldHint: false`.

## Step 3 — wire a new domain file

Only when you created a new `src/tools/<domain>.ts`: add
`registerYourDomainTools(register)` to `registerTools` in
`packages/connectors/camunda/camunda7-connector/src/tools/index.ts`, mirroring the existing calls.

## Step 4 — widget path (only for UI features)

Widget components live in `packages/connectors/camunda/camunda7-connector/src/widgets/` and receive their data as
a `data` prop. Compose them from the shared kit `@miragon-ai/widget-shell/widgets` —
never re-inline these primitives:

- `ViewDataState` — the loading/error/no-data guard (no inline Alert/loading ternary)
- Self-fetching widgets: skeleton + error via `QueryFallback` (+ `TableSkeleton`) — a
  missing `isError` branch means an eternal skeleton
- `formatTimestamp`/`formatDate`/`formatTime` (dates) and `formatNumber`/`formatPercent`/
  `formatPercentPoints`/`formatPeriod`/`formatDuration`/`truncate`: no local format
  helpers, no `toFixed`, no argument-less `toLocaleString()` (canonical duration style
  "3m 7s" / German "3 Min. 7 s"; "3,7 %", "+0,2 Pp.", "7 Tage")
- `Section` (collapsibles); `Th`/`Td`/`TableEmptyState` (tables); `WidgetHeader`
  (`badge`/`titleSuffix`/`size="detail"`, no icon tile) + `VersionChip` (hero/detail
  headers); `KpiGrid` (KPI strips, incl. `variant="soft"`); `WidgetShell` (page
  container, split into View + Shell only when the body is embedded elsewhere)
- Status: a `ToneVariant` (`danger`/`warning`/`success`/`info`/`neutral`; open incident or
  failed job without retries = `danger`, retries left or degraded = `warning`) shown via
  `StatusBadge`/`CountPill`/`KpiCell.tone` or the `TONE_DOT`/`TONE_BORDER`/`TONE_ICON`/
  `TONE_TINT`/`TONE_SOFT`/`TONE_INK` maps, next to readable words; never a coloured
  number, never a palette class or raw colour; text in a tone uses the `-ink` role
- Icons: Lucide via `Icon` (`import { FileSearch } from "lucide-react"`; the package pins
  devDependency `lucide-react` `0.562.0`, see CLAUDE.md invariant 6), never a Unicode glyph
  or emoji; `AskAiButton` gets the `icon` of the concrete function and a verb that names
  the chat ("Im Chat erklären" / "Explain in chat"); `OpenInCockpitLink` gets
  `vendor={provider.branding.displayName}`
- Copy: en + de catalogs in the brand voice (du, AI, "CIB seven", no dash connector,
  errors say what happened and what you can do); the package's brand-gate test runs
  `catalogTextFindings` over both catalogs and `scanGlyphs` over `src/widgets` +
  `src/messages` (`@miragon-ai/widget-shell/testing`)
- BPMN: viewer lifecycle and the fixed light canvas via `useBpmnViewer` +
  `BpmnZoomControls`; highlight/legend colors via `HIGHLIGHT_COLORS` from
  `src/widgets/bpmn-highlights.ts`

**Paged list recipe** (every list that can exceed one page follows it — reference:
`src/widgets/process-instances/list.tsx`):

1. Feed: accept `firstResult`/`maxResults` (+ server-side filter params like
   `businessKeyLike`/`nameLike`) and return the full filtered total (via the matching
   `/count` endpoint) so the footer is honest.
2. Widget: `usePagedListView` (owns search state, 300 ms debounce, the server-side
   `searchArg`, and the drop-initialData-on-interaction rule; chips go into
   `filtersActive` + the `args`) → `FilterBar` → `PagedRows` (marks the rows while they
   are the previous result) around `ListTable` (frame + `Th` header row;
   rows stay hand-composed `<tr>` + `Td`) or a `RowCard` stack → `TableEmptyState`
   (distinguish "no match" when `interacted`) → `CockpitListFooter`
   (`src/widgets/list-footer.tsx` — the stale page-0 error and the load-more error,
   each with its own retry, + "Showing X of Y" + Load more; deliberately not infinite
   scroll; rendered under an empty result too). Guard the whole view on
   `!paged.firstPage` only: a search keeps the previous rows (and the search box)
   mounted while its page 0 is in flight. While it does, `paged.stale` is true and
   `firstPage`/`total` are the PREVIOUS result's — a header count, the filters it
   covers and the model context read the payload's echo (`data.filters`), never the
   request's args (reference: the instance list's `listFilters`).

The registration chain has **four links — miss one and the widget is silently absent
somewhere**:

1. `src/widgets/registry.ts` — map the component to its dataType:
   `"camunda7:my-widget": adaptDataWidget(MyWidget, "camunda7:myData")`
   (`adaptDataWidget` comes from `@miragon-ai/widget-shell/ui`).
2. `src/definition.ts` — add the widget entry (`id`, `requires`, `size`, optional
   `propsSchema`) to the `widgets` array.
3. `apps/mcp-server-camunda7/src/ui/widget-registry.ts` — the host bundle map. It spreads
   `camunda7Widgets` from `src/widgets/index.ts`, which spreads the registry — verify
   your widget actually arrives in the host map.
4. `src/tool-names.ts` — add a `CAMUNDA7_SHOW_*` / `CAMUNDA7_*_DATA` constant for every
   new widget tool, so `host.showWidget(...)` call sites stay rename-safe.

Links 1↔2 are guarded by `src/widgets/catalogue-sync.test.ts`; link 3 you verify by
hand.

Then register the widget tool in `src/widget-tools.ts` (this file is the documented
exception that uses `server.tool()` directly):

- Every widget-path tool (show tool AND feed) declares
  `inputSchema: strictToolInput({ … })` (from `@miragon-ai/widget-shell/server`) — never
  a bare `z.object`, which strips an unknown key silently;
  `apps/mcp-server-camunda7/test/strict-input.e2e.test.ts` refuses any module tool that
  accepts one.
- `show_*` tools: spread `...showToolBinding(TOOL_NAME_CONST, "Title")` (from
  `@miragon-ai/widget-shell/server`) into the definition and use `inputSchema:` (mcp-use 2
  field name) — the helper binds a native mcp-use view named after the tool
  (`view: { name }`, mcp-use then emits all `_meta.ui.*` keys and the
  `ui://views/<tool>.html` resource itself), adds the required passthrough
  `outputSchema`, and stamps the Apps-SDK half via `appsSdkMeta`; **never write
  `_meta.ui` keys by hand** (mcp-use owns and overwrites that namespace). Resolve the engine via
  `await resolveEngine(args.engine, registry)` — it already returns `baseUrl`/`cockpitUrl`;
  never fish them out of `registry.engines`. Return
  `buildSingleWidgetView({ widget, app: "camunda7", dataType, data, title, summary })` or
  `buildComposedView(...)` (both from `@miragon-ai/widget-shell/server`). The
  `summary` is the model-facing text channel (1-2 sentences, key figures, no raw
  data) — the full payload travels only in `structuredContent`.
- `*_data` feeds: spread `...appOnly` (from `@miragon-ai/widget-shell/server` — the native
  `visibility: "app"` field, emitted as SEP-1865 `_meta.ui.visibility: ["app"]`, plus
  `openai/widgetAccessible`; **no** view binding) — return `buildDataFeedResult(data)` (from
  `@miragon-ai/widget-shell/server`, aliased `rawData` in `widget-tools.ts`) so the
  in-widget `callTool()` gets JSON back instead of the host rendering a new widget.
  Wrap every handler in `withToolErrors` (from `@miragon-ai/widget-shell/server`).
- Shared data paths: every number a view shows comes from ONE builder in `src/data/`
  that its show tool, its `*_data` feed AND its pipeline step call — never fork one.
  Definition lookups (id parsers, the key lookup, the per-KEY fold of the per-version
  statistics) come from `src/data/definition-info.ts`; the BPMN viewer payload from
  `src/data/bpmn-viewer-data.ts`. A key's latest version is `fetchLatestDefinition`
  (every tenant) — never `/process-definition/key/{key}`, which only knows tenant-less
  definitions. A long key's (over ~25 characters) definition id is a bare generated
  UUID that names no key, so ANY key that scopes a query, a drill, a hand-off or a
  cockpit link is resolved, never parsed: a view queried by key uses that key; rows
  that carry only a definition id go through `resolveDefinitionKeys` (at most ONE
  definition-statistics read, none when every id names its key) — a primary read where
  the key is what the view hands on, else wrapped in `optional(...)` as enrichment, so
  a bare id's key is `null` (no drill, no link), never its UUID. A view that already
  reads the statistics resolves through `definitionKeyResolver` over them.
  `processDefinitionKeyFromId` is a display fallback only.
- **Honest numbers** (`src/data/engine-reads.ts`): PRIMARY rows and counts — what the
  view exists to show, and every number its `summary` reports — propagate engine
  failures (read them through `countOf`/`rowsOf`; `withToolErrors` turns the throw into
  a tool error), and an unknown id or key is a not-found error — never a view of zeros. Only
  ENRICHMENT (display names, diagram XML, cockpit links, optional history) degrades, via
  `optional(...)`, and to `null` — never to a `0`, `[]` or `{}` that reads as a fact.
  Widgets render that null as "—" (`formatCount`, `src/widgets/lib/format-count.ts`),
  summaries as "unknown". Totals come from `/count` endpoints or statistics, never from
  the length of a capped page or scan: a recency scan (`INCIDENT_SCAN_LIMIT`, the health
  views' `CLUSTER_SCAN_LIMIT`) only enriches and says how far it reaches
  (`scannedIncidentCount`, null facts, "≥N" via `formatCountAtLeast`). A view about
  a process definition KEY spans every deployed version (key-scoped `/count`, statistics
  summed per key); only a diagram is one version, and it is labelled. Engine timestamps
  compare by instant (`engineDateMillis`/`latestEngineDate`/`earliestEngineDate` from
  `@miragon-ai/camunda7-client`), never as strings. A new builder adds its case to the
  rejection table in `src/data/honest-numbers.test.ts` — the table fails without it. The
  table breaks EVERY read the healthy build makes (method + path + query names), so a
  case declares only its enrichment reads; any other read whose failure is swallowed fails.
- Pipeline steps (`src/steps/`) are thin adapters over their show tool's builder
  (`stepEngine`/`requiredKey`/`stringKey` from `src/steps/shared.ts`), stamp `engineId`,
  and declare a `description` plus `optionalKeys` (always `ENGINE_KEY`, and every scoping
  key the step reads) so `get-framework-manifest` shows them. A failure throws — never a
  success-shaped empty payload. Add the step to the twin table in
  `src/steps/steps.test.ts`, which holds its output AND its engine requests EQUAL to the
  show tool's — a dropped or misnamed scoping key changes the requests.
- The `show_*`/`*_data` naming is load-bearing:
  `apps/mcp-server-camunda7/test/widget-contract.e2e.test.ts` enforces the widget `_meta` on
  every `*_show_*` tool and app-only visibility on every `*_data` feed **by name**.
- A widget-path tool that performs a durable write must honor the toolset itself —
  follow `camunda7_save_user_profile` in `src/tools/user-profile.ts`
  (`resolveCamunda7Toolset` + `isToolInToolset`): a missing toolset resolves to
  `read-only` exactly like an unknown name — never treat `undefined` as "everything".
- Every in-widget write runs through `useEngineAction({ tool, target, resetOn, available })`
  (`src/widgets/lib/engine-action.ts`) — never a raw `useToolMutation`/`callTool`. Its
  `allowed` is the gate — the toolset AND the subject's current state (`available`:
  false for an ended, cancelled or unconfirmed instance, a suspended one where the
  engine refuses the write): render the control only when true (hide it and a table
  column it would leave empty, never just disable it). List
  the tool in `CAMUNDA7_WIDGET_ACTIONS` (`src/tool-names.ts`) and give it a
  `WRITE_POLICY` entry (`src/widgets/lib/write-policy.ts`: the query namespaces it
  changes, and `confirm: true` for irreversible/state-changing writes — then `run`
  needs a confirmation naming its target, rendered by `EngineActionDialog`, with
  verb + object on both buttons). Optimistic state reads `action.done` (dropped when
  `resetOn` changes — pass the data the marked ROWS come from, not a sibling feed).
  `src/widget-actions.test.ts` enforces all of it structurally; add
  the new call site to `src/widgets/action-gating.sites.ts` + its renderer in
  `action-gating.test-support.tsx`.
- Everything the widget tells the model goes through `useHandOff()`
  (`src/widgets/lib/hand-off.ts`): `<AskAiButton prompt={ask(handOff)} />` and
  `<HostModelContext content={context(view)}>`. A hand-off is a typed spec — an `intent`
  key from `messages/{en,de}.ask-ai.ts` (static, no tool names) or a static view
  `summary`, plus `ids` (arguments every named tool may take), `toolIds` (arguments only
  one tool takes, inlined only while it is named), `facts`, `untrusted` (engine text —
  fenced) and `tools` (filtered by the live surface). Reference:
  `src/widgets/remediation.ts`; the rules are CLAUDE.md invariant 6, enforced by
  `apps/mcp-server-camunda7/test/hand-off-surface.test.ts`.

## Step 5 — verify

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint
# for widget/shell changes additionally:
pnpm --filter @miragon-ai/mcp-server-camunda7 test:host
```

A new or changed tool changes the wire surface: add its name to
`apps/mcp-server-camunda7/test/expected-tools.ts`, then refresh the per-toolset goldens with
`GOLDEN_UPDATE=1 pnpm --filter @miragon-ai/mcp-server-camunda7 test` and commit the
`test/__golden__/` diff (descriptions and schemas are what the model reads — review them).
If `char-budgets.json` grew, `pnpm lint` fails until the commit carries a
`Ratchet-Exception: <why the model must read more>` trailer — trim wording first.

`pnpm typecheck` is the **only** automated check that type-checks widget `.tsx` code
(`tsc -p tsconfig.widgets.json`) — never skip it. For widgets also do a manual render
check: `docker compose -f playground/docker/docker-compose.yml up -d`, `pnpm dev`, then call the
tool in the inspector at `http://localhost:8400/mcp/inspector`. The default `pnpm dev` boot
is read-only (the boot log names the toolsets) — to exercise a write tool or button, set
`MCP_ACTIVE_MODULES=camunda7:admin,analytics:standard` in `.env` (plus
`CAMUNDA_ALLOW_DEPLOYMENTS=true` for deployments). Run `pnpm format:check` (or
`pnpm format`) before committing.
