---
name: add-bpm-feature
description: Step-by-step house pattern for adding a new BPM operations tool, widget tool, or widget to the camunda7 module (`packages/mcp-cibseven` + `packages/client-cibseven`). Use whenever adding or changing Camunda 7 / CIB Seven tools ("add a tool to suspend jobs", "expose X from the engine REST API"), input schemas, `show_*` widget tools, `*_data` feeds, or React widgets in the cockpit. Takes precedence over the generic mcp-apps-builder skill.
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

## Step 1 — input schema in client-cibseven

Add the Zod input schema to `packages/client-cibseven/src/schemas/<domain>.ts` and export
it from `src/schemas/index.ts`. Existing style (from `schemas/process-instances.ts`):

```ts
export const listProcessInstancesInput = z.object({
  processDefinitionKey: z.string().optional().describe("Filter by process definition key"),
  businessKey: z.string().optional().describe("Filter by business key"),
  active: z.boolean().optional().describe("Only active instances"),
  maxResults: z.number().int().positive().optional().default(20).describe("Maximum results"),
})
```

Every field gets a `.describe()`. The REST calls themselves use the generated SDK in
`packages/client-cibseven/src/generated/sdk.gen.ts` — if the endpoint is missing there,
the OpenAPI spec changed and you need `pnpm generate`, not a hand-written fetch.

## Step 2 — register the tool

Add the tool in `packages/mcp-cibseven/src/tools/<domain>.ts`. Reference template —
`camunda7_list_process_instances` from `src/tools/process-instances.ts`:

```ts
import { listProcessInstancesInput } from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { getProcessInstances } from "@miragon-ai/client-cibseven/generated/sdk.gen"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

export function registerProcessInstanceTools(register: Register) {
  register({
    name: "camunda7_list_process_instances",
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

- `inputSchema` spreads `...engineParamShape` so every tool accepts the per-call
  `engine` override.
- `handler` is wrapped in `withEngine(...)` — never construct, cache, or import a client
  directly; `withEngine` resolves the engine from the registry per call.
- Tool names are `camunda7_<verb>_<noun>` in snake_case.
- Write tools that only flip state return a small `{ success: true, … }` object instead
  of the raw (often empty) REST response.

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
`packages/mcp-cibseven/src/tools/index.ts`, mirroring the existing calls.

## Step 4 — widget path (only for UI features)

Widget components live in `packages/mcp-cibseven/src/widgets/` and receive their data as
a `data` prop. The registration chain has **four links — miss one and the widget is
silently absent somewhere**:

1. `src/widgets/registry.ts` — map the component to its dataType:
   `"camunda7:my-widget": adaptDataWidget(MyWidget, "camunda7:myData")`
   (`adaptDataWidget` comes from `@miragon-ai/widget-shell/ui`).
2. `src/definition.ts` — add the widget entry (`id`, `requires`, `size`, optional
   `propsSchema`) to the `widgets` array.
3. `apps/mcp-gateway/src/ui/widget-registry.ts` — the host bundle map. It spreads
   `camunda7Widgets` from `src/widgets/index.ts`, which spreads the registry — verify
   your widget actually arrives in the host map.
4. `src/tool-names.ts` — add a `CAMUNDA7_SHOW_*` / `CAMUNDA7_*_DATA` constant for every
   new widget tool, so `host.showWidget(...)` call sites stay rename-safe.

Then register the widget tool in `src/widget-tools.ts` (this file is the documented
exception that uses `server.tool()` directly):

- `show_*` tools: `_meta: { ui: { resourceUri } }`, resolve the engine via
  `resolveEngine(args.engine, registry)`, return
  `buildSingleWidgetView({ widget, app: "camunda7", dataType, data, title, summary })` or
  `buildComposedView(...)` (both from `@miragon-ai/widget-shell/server`). The
  `summary` is the model-facing text channel (1-2 sentences, key figures, no raw
  data) — the full payload travels only in `structuredContent`.
- `*_data` feeds: `_meta: appOnlyMeta` (= `{ ui: { visibility: ["app"] } }`,
  SEP-1865 — hides the tool from the LLM on conforming hosts; **no**
  `resourceUri`) — return `rawData(data)` so the in-widget `callTool()` gets
  JSON back instead of the host rendering a new widget. Wrap every handler in
  `withToolErrors` (from `@miragon-ai/widget-shell/server`).

## Step 5 — verify

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint
```

`pnpm typecheck` is the **only** automated check that type-checks widget `.tsx` code
(`tsc -p tsconfig.widgets.json`) — never skip it. For widgets also do a manual render
check: `docker compose -f docker/docker-compose.yml up -d`, `pnpm dev`, then call the
tool in the inspector at `http://localhost:8400/inspector`. Run `pnpm format:check`
(or `pnpm format`) before committing.
