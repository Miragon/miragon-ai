---
name: create-module
description: Step-by-step house pattern for building your own connector module under `modules/` — a self-contained package exporting a module definition plus tools, wired into the server composition. Use whenever integrating a new system ("build a connector for X", "add tools for our API", "new module"), or wiring a module into the server. For the widget path see the add-widget skill; for per-user settings see add-settings-section.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# create-module — your own connector module

A module is a workspace package that exports a module-definition object
conforming **structurally** to the server's port (the `ModuleDefinition` type
in `server/src/setup.ts` — your module never imports the server, the server
never reaches into your module). Modules are peers: they never import each other; anything shared goes
through `@miragon-ai/widget-shell` or the app-wired `SharedResources`.

**Reference implementation: `modules/mcp-notes`.** Copy it rather than
inventing a new shape — every step below points at the file that shows the
pattern. For patterns the notes module doesn't cover (toolsets, settings,
paged lists), the published Miragon modules ship their sources under
`node_modules/@miragon-ai/{camunda7,analytics}-connector/src/`.

## Step 1 — scaffold the package

```bash
cp -R modules/mcp-notes modules/mcp-<name>
```

`pnpm-workspace.yaml` already covers `modules/*` — no workspace edit needed.
Then adjust:

- `package.json`: name it `@<your-scope>/mcp-<name>` and keep the three-entry
  `exports` map exactly — `.` (compiled server code), `./widgets` (pointing at
  **TypeScript source**, compiled by the server's Vite build), `./definition`.
  Keep `react` an optional peer: server-side consumers must not need it.
- Keep both tsconfigs: `tsconfig.json` excludes `src/widgets` from the server
  build; `tsconfig.widgets.json` type-checks the widget `.tsx` (wired into the
  `typecheck` script — the only check that covers widget code).
- Do a global rename `notes` → `<name>` across `src/` (module name, tool
  prefixes, widget ids, data types).

## Step 2 — the data layer

`src/notes-store.ts` shows the shape: tools and widgets only ever see an
interface; the implementation behind it is yours (an HTTP client, an SDK, a
DB). Keep the client code in this layer — handlers stay thin. If the client
grows real weight (generated SDK, query library), split it into its own
package later — extract on the second consumer, not speculatively.

## Step 3 — the module definition (`src/module.ts`)

The contract, field by field (see `notesModule`):

- `name` — the key used in `MCP_ACTIVE_MODULES` and as the plugin's app name.
- `configFromEnv(env)` — **pure** env → raw-config mapping; no I/O, no
  `process.env` reads outside the argument, no validation here.
- `knownEnvVars` — every env var your module reads. This feeds the server's
  boot-time typo warner, and each var contributes its prefix (`ACME_URL` →
  `ACME_`) to the watched set — your module gets the same typo coverage as the
  built-in ones.
- `supportsToolsets` — `false` unless you implement Step 5.
- `createPlugin(config, shared)` — validate `config` with your zod schema
  (**this** is where validation lives) and return the `AppPlugin`: construct
  your data source/client once and pass it to both `registerTools` and
  `registerWidgetTools`. `shared` is the app-wired cross-module resource bag;
  type the fields you consume structurally (e.g.
  `profileStore?: ProfileSource`) and tolerate their absence.
- Optional `bootWarnings(env)` — return actionable hints for misconfigured
  deployments (see the analytics module's Prometheus-URL warning).

## Step 4 — catalogue and tools

- `src/definition.ts` — the module catalogue: `name`, `steps: []`, and one
  entry per widget (start with `widgets: []` if you have none yet).
- `src/tools.ts` — plain tools **for the model**, registered through
  `createToolRegistrar(server, store)` (from `@miragon/mcp-toolkit-core/tools`)
  — the second argument is threaded into every handler as its first parameter.
  Raw `server.tool()` is reserved for the widget path (`widget-tools.ts`).

Tool conventions (they carry the contract, so they are not cosmetic):

- Names are `<module>_<verb>_<noun>` in snake_case. **Never** use `_show_` or a
  `_data` suffix for a plain tool — the server's wire-contract e2e test asserts
  widget `_meta` on every `*_show_*` tool and app-only visibility on every
  `*_data` feed, by name, across all composed modules including yours.
- Every input field gets a `.describe()`.
- Annotations: reads get `{ readOnlyHint: true, idempotentHint: true }`
  (+ `openWorldHint: true` when they talk to an external system); writes drop
  `readOnlyHint`; irreversible operations add `destructiveHint: true`.
- Write tools that only flip state return a small `{ success: true, … }`
  object, not the raw (often empty) upstream response.

## Step 5 — toolsets (optional)

Skip this until someone needs to run your module with a narrowed tool surface
(`MCP_ACTIVE_MODULES=<name>:read-only`). Then:

- Set `supportsToolsets: true`; the suffix arrives as `config.toolset` in
  `createPlugin`.
- Filter registrar tools by their annotations (read-only ⇔
  `readOnlyHint: true`), and gate durable writes registered outside the
  registrar **against your declared toolset list, failing CLOSED on unknown
  names** — never a `toolset === "read-only"` string compare, which fails open
  for every name you add later. Reference:
  `node_modules/@miragon-ai/analytics-connector/src/toolsets.ts`.

## Step 6 — wire the module into the server

Five edits, plus the env documentation. The failure modes of the middle three
are **silent** (tools work, widgets render empty or unstyled) — which is why
the last one exists:

1. `server/package.json` — add `"@<your-scope>/mcp-<name>": "workspace:*"`,
   then `pnpm install`.
2. `server/src/setup.ts` — add your module to `MODULES`.
3. `server/src/ui/widget-registry.ts` — spread your `<name>Widgets` map
   (needed once you have widgets; harmless before).
4. `server/src/ui/globals.css` — add
   `@source "../../../modules/mcp-<name>/src";` so Tailwind scans your widget
   sources (missing = silently unstyled widgets).
5. `server/test/widget-registry.test.ts` — add your `definition` to **both**
   describe blocks, so the guard actually covers your module.

Then document every var from `knownEnvVars` in `.env.example` —
`server/test/env-example.test.ts` fails on both drift directions (undocumented
var, or a documented var no module reads).

The wire-contract e2e test (`server/test/widget-contract.e2e.test.ts`) needs no
edit: it boots the composed server in-process and covers your module by naming
convention.

## Step 7 — verify

```bash
pnpm build && pnpm typecheck && pnpm test
```

Then boot it for real: `pnpm dev`, check the boot log (your module's env-var
typo coverage and boot warnings show up here), and call your tools in the
inspector at `http://localhost:8400/inspector`. Also verify the selection path:
`MCP_ACTIVE_MODULES=<name> pnpm dev` must expose exactly your module's tools.

## Anti-patterns

- Importing another module (or the server) instead of conforming structurally —
  peer isolation is the architecture.
- Validating config in `configFromEnv` (belongs in `createPlugin`) or reading
  `process.env` anywhere else in the module.
- Registering plain tools with raw `server.tool()` — the registrar is the
  contract; the raw path is for widget tools only.
- Naming a plain tool `*_data` or `*_show_*` — the e2e naming contract will
  fail it, correctly.
- Talking to your backend from widget code — widgets self-fetch through
  `*_data` feeds only (see the add-widget skill).
