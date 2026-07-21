---
name: add-bpm-feature
description: Step-by-step house pattern for adding a new BPM operations tool, widget tool, or widget to the camunda7 module (`packages/mcp-camunda7` + `packages/client-camunda7`). Use whenever adding or changing Camunda 7 / CIB Seven tools ("add a tool to suspend jobs", "expose X from the engine REST API"), input schemas, `show_*` widget tools, `*_data` feeds, or React widgets in the cockpit. Takes precedence over the generic mcp-apps-builder skill.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# add-bpm-feature — new tool/widget in the camunda7 module

The camunda7 module never registers operations tools with raw `server.tool()`. Tools go
through the toolkit registrar; engine access goes through `withEngine`/`resolveEngine`
(per-call `engine` override > sticky session selection > single default). Widgets hang
off a four-link registration chain. Follow the steps for the path you need.

## Step 0 — pick the render path

| You need…                                | Path                                                       |
| ---------------------------------------- | ---------------------------------------------------------- |
| JSON data for the model                  | Registrar tool in `src/tools/<domain>.ts` (Steps 1–3)      |
| A widget rendered for the user + summary | `show_*` widget tool in `widget-tools.ts` (Step 4)         |
| App-only JSON for in-widget refresh/nav  | `*_data` feed in `widget-tools.ts`, `appOnlyMeta` (Step 4) |

## Step 1 — input schema in client-camunda7

Add the Zod input schema to `packages/client-camunda7/src/schemas/<domain>.ts` and export
it from `src/schemas/index.ts`. Existing style (from `schemas/process-instances.ts`):

```ts
export const listProcessInstancesInput = z.object({
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  businessKey: z.string().optional().describe("Filter by business key"),
  active: z.boolean().optional().describe("Only active instances"),
  maxResults: z.number().int().positive().optional().default(20).describe("Maximum results"),
})
```

Every field gets a `.describe()`. The REST calls themselves use the generated SDK
(imported from `@miragon-ai/client-camunda7/sdk`) — if the endpoint is missing there,
the OpenAPI spec changed and you need `pnpm generate`, not a hand-written fetch.

## Step 2 — register the tool

Add the tool in `packages/mcp-camunda7/src/tools/<domain>.ts`. Reference template —
`camunda7_list_process_instances` from `src/tools/process-instances.ts`:

```ts
import { listProcessInstancesInput } from "@miragon-ai/client-camunda7/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { getProcessInstances } from "@miragon-ai/client-camunda7/sdk"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerProcessInstanceTools(register: Register) {
  register({
    name: "camunda7_list_process_instances",
    category: "process-instances",
    description: "List running process instances with optional filters.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...listProcessInstancesInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
      getProcessInstances({
        client,
        query: { processDefinitionKey: args.processDefinitionKey /* … */ },
      }),
    ),
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
  batches) must be added to `ADMIN_ONLY_TOOLS` in `src/lib/toolsets.ts` so the
  `camunda7:read-only|operations|admin` toolset filtering stays correct — `read-only`
  membership is derived from `readOnlyHint: true`. `src/lib/toolsets.test.ts` enforces
  the rule structurally over every registered tool (`destructiveHint` ⇒ admin-only,
  read-only ⇒ `readOnlyHint`) — get the annotations right; never edit the test to pass.

### Annotation conventions

| Operation                               | Annotations                                                         |
| --------------------------------------- | ------------------------------------------------------------------- |
| Read / list / get                       | `{ readOnlyHint: true, idempotentHint: true, openWorldHint: true }` |
| Write (start, set variable, suspend, …) | `{ openWorldHint: true }`                                           |
| Delete / irreversible (delete, modify)  | `{ destructiveHint: true, openWorldHint: true }`                    |

Every camunda7 tool carries `openWorldHint: true` (it talks to an external engine).

## Step 3 — wire a new domain file

Only when you created a new `src/tools/<domain>.ts`: add
`registerYourDomainTools(register)` to `registerTools` in
`packages/mcp-camunda7/src/tools/index.ts`, mirroring the existing calls.

## Step 4 — widget path (only for UI features)

Widget components live in `packages/mcp-camunda7/src/widgets/` and receive their data as
a `data` prop. Compose them from the shared kit `@miragon-ai/widget-shell/widgets` —
never re-inline these primitives:

- `ViewDataState` — the loading/error/no-data guard (no inline Alert/loading ternary)
- Self-fetching widgets: skeleton + error via `QueryFallback` (+ `TableSkeleton`) — a
  missing `isError` branch means an eternal skeleton
- `formatTimestamp`/`formatDate`/`formatTime`/`formatDuration`/`truncate` — no local
  format helpers (canonical duration style "3m 7s")
- `Section` (collapsibles); `Th`/`Td`/`TableEmptyState` (tables); `WidgetHeader`
  (`badge`/`titleSuffix`/`size="detail"`) + `VersionChip` (hero/detail headers);
  `KpiGrid` (KPI strips, incl. `variant="soft"`); `WidgetShell` (page container — split
  into View + Shell only when the body is embedded elsewhere)
- BPMN: viewer lifecycle via `useBpmnViewer` + `BpmnZoomControls`; highlight/legend
  colors via `HIGHLIGHT_COLORS` from `src/widgets/bpmn-highlights.ts`

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

- `show_*` tools: `_meta: buildUiMeta({ resourceUri })` (`uiMeta` from
  `@miragon/mcp-toolkit-core`) — since toolkit 0.8.0 it emits the full dual-protocol
  widget contract (`ui/resourceUri`, `openai/outputTemplate`, `openai/toolInvocation/*`,
  …) that ext-apps hosts key on; **never add those keys by hand**. Resolve the engine via
  `resolveEngine(args.engine, registry)` — it already returns `baseUrl`/`cockpitUrl`;
  never fish them out of `registry.engines`. Return
  `buildSingleWidgetView({ widget, app: "camunda7", dataType, data, title, summary })` or
  `buildComposedView(...)` (both from `@miragon-ai/widget-shell/server`). The
  `summary` is the model-facing text channel (1-2 sentences, key figures, no raw
  data) — the full payload travels only in `structuredContent`.
- `*_data` feeds: `_meta: appOnlyMeta` (= `{ ui: { visibility: ["app"] } }`,
  SEP-1865 — hides the tool from the LLM on conforming hosts; **no**
  `resourceUri`) — return `buildDataFeedResult(data)` (from
  `@miragon-ai/widget-shell/server`, aliased `rawData` in `widget-tools.ts`) so the
  in-widget `callTool()` gets JSON back instead of the host rendering a new widget.
  Wrap every handler in `withToolErrors` (from `@miragon-ai/widget-shell/server`).
- Shared data paths: definition name/version/instance lookups come from
  `src/data/definition-info.ts`; the BPMN viewer payload comes from
  `src/data/bpmn-viewer-data.ts`, which feeds BOTH the widget tool and the pipeline
  step (`steps/bpmn-viewer.ts`) — never fork either.
- The `show_*`/`*_data` naming is load-bearing:
  `apps/mcp-server-camunda7/test/widget-contract.e2e.test.ts` enforces the widget `_meta` on
  every `*_show_*` tool and app-only visibility on every `*_data` feed **by name**.
- A widget-path tool that performs a durable write must honor the toolset itself —
  follow `camunda7_save_user_profile` in `src/tools/user-profile.ts`
  (`isCamunda7Toolset` + `isToolInToolset`, failing open on unknown toolset names).

## Step 5 — verify

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint
# for widget/shell changes additionally:
pnpm --filter @miragon-ai/mcp-server-camunda7 test:host
```

`pnpm typecheck` is the **only** automated check that type-checks widget `.tsx` code
(`tsc -p tsconfig.widgets.json`) — never skip it. For widgets also do a manual render
check: `docker compose -f playground/docker/docker-compose.yml up -d`, `pnpm dev`, then call the
tool in the inspector at `http://localhost:8400/inspector`. Run `pnpm format:check`
(or `pnpm format`) before committing.
