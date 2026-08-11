---
name: add-settings-section
description: Step-by-step house pattern for giving a module its own user-settings slice — a schema under `profile.modules.<module>`, the show/data/save tool triple, and a settings-page section widget. Use whenever adding or changing persisted user preferences ("make X configurable per user", "add a setting for Y", "new settings section", "persist this default"), the user-profile record, the profile store, or the cockpit settings page. Takes precedence over the generic mcp-apps-builder skill.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# add-settings-section — module-owned user settings

Settings live in ONE profile record per user/session, shared by all modules
(`packages/mcp-camunda7/src/lib/profile-schema.ts`). Each module owns a **slice** under
`profile.modules.<module>`: the profile only transports it, the module owns its schema,
validates it fail-soft on read, and writes it through its own save tool. The store merges
per module key, so a save of `modules.<yours>` never touches another module's slice.

Reference implementation — read it before writing anything:
`packages/mcp-analytics/src/settings.ts` + `settings-tools.ts` +
`src/widgets/settings-section.tsx`.

**Decide first: slice or core preference?** A setting only your module understands
(analysis window, threshold) is a slice — everything below applies. A setting the whole
server acts on (`language`, `theme`, engine availability) belongs in
`userProfilePreferencesSchema` instead: add the field there, bump
`PROFILE_SCHEMA_VERSION` in `lib/profile-constants.ts`, add the matching entry to
`PROFILE_MIGRATIONS` in `lib/profile-migrations.ts` (a bump without a migration silently
resets stored preferences), and extend the camunda7 profile widget. Don't put
module-specific vocabulary into the core schema — v1→v2 moved the analytics fields out of
it for exactly that reason.

## Step 1 — the slice schema (`src/settings.ts`)

```ts
export const MODULE_KEY = "<module>" // the key inside profile.modules

export const mySettingsSchema = z.object({
  someDefault: z.enum(THINGS).default("a").describe("…applied when a call omits `thing`."),
})

/** Fail-soft: a missing, foreign or hand-edited slice yields the defaults. */
export function parseMySettings(modules: Record<string, unknown> | undefined): MySettings {
  const parsed = mySettingsSchema.safeParse(modules?.[MODULE_KEY] ?? {})
  return parsed.success ? parsed.data : mySettingsSchema.parse({})
}
```

Every field gets a `.default()` — a never-saved slice must still yield a complete,
renderable object. Derive enums from their source of truth (`PERIODS`, never a copy).

Then the single place tools apply **"explicit arg > saved setting > schema default"**:

```ts
export async function settingsFor(store: ProfileSource | undefined, ctx?: unknown) {
  if (!store) return mySettingsSchema.parse({})
  const key = resolveSettingsKey(ctx)
  if (!key) return mySettingsSchema.parse({})
  try {
    return parseMySettings((await store.get(key))?.modules)
  } catch {
    return mySettingsSchema.parse({})
  } // store OUTAGE must not fail a read
}
```

Fail-soft on every axis is the rule, not politeness: a profile-store hiccup must never
fail a read that only needs Prometheus/the engine. At the tool boundary the affected
input becomes `.optional()` (no zod default) so "omitted" stays distinguishable from
"explicitly set" — see `optionalPeriod` in `mcp-analytics/src/settings.ts`.

## Step 2 — the save input must be default-FREE

**The trap:** zod 4 re-applies `.default()`s THROUGH `.partial()` on parse. A defaulted
partial materializes omitted fields at the tool boundary, so a "single-field" save
silently resets every other value.

```ts
export const mySettingsSaveInput = z.object({
  someDefault: z.enum(THINGS).optional().describe("… Omitted → unchanged."),
})
```

Derive it instead of hand-writing it whenever the schema's own descriptions work at a
write boundary:

```ts
import { withoutDefaults } from "@miragon-ai/widget-shell/server"
export const mySettingsSaveInput = z.object(withoutDefaults(mySettingsSchema.shape)).partial()
```

Analytics spells its input out by hand only because a save wants different wording
("Omitted → unchanged"). Either way, cover it with a test that asserts omitted keys stay
**absent** after the parse (see `packages/mcp-analytics/src/settings.test.ts`, "keeps
omitted fields ABSENT").

## Step 3 — the profile port + key resolution (do NOT reimplement)

Every module reads and writes the SAME profile record, so the key precedence is a shared
contract, not a module opinion — a divergent copy silently splits one user's settings
across two records. Import it; never re-derive it:

```ts
import {
  resolveProfileKey,
  resolveAuthUserId,
  type ProfileSource,
} from "@miragon-ai/widget-shell/server"
```

`ProfileSource` is the narrow read/write view a module gets: the locale plus its own
slice, and `save?` for a `modules` patch. camunda7's `ProfileStore` satisfies it
structurally (asserted at compile time in the app's `module-contract.ts`), so nobody has
to import the camunda7 module. Alias them to your module's vocabulary if the call sites
read better that way (`export const resolveSettingsKey = resolveProfileKey`).

`resolveProfileKey(ctx)` precedence: auth user id (`ctx.auth.user.userId`, else the
request context's `auth` var) > the `Mcp-Session-Id` header > `ANONYMOUS_PROFILE_KEY`
when there is **no** request context at all (stdio/tests) > `undefined` for an HTTP
request without a session id (reads fall back to defaults, saves fail visibly — keyless
clients must never cross-share one record).

`resolveAuthUserId(ctx)` is the auth-only half: the save path stamps it as `opts.userId`,
which marks the record user-bound and exempt from the app's session-TTL cleanup
(`MCP_PROFILE_SESSION_TTL_DAYS`).

The store reaches your module via `SharedResources.profileStore`, threaded into
`createPlugin` by the app (`apps/mcp-server-camunda7/src/module-contract.ts`) — take it
as an optional config field; without it the section stays read-only.

## Step 4 — the tool triple (`src/settings-tools.ts`)

Three render paths, three tools — model them on `registerSettingsTools`:

| Tool                     | Binding / `_meta`                                                       | Returns                                              |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| `<module>_show_settings` | `...showToolBinding(name, title)` (view binding + Apps-SDK `_meta`)     | `buildSingleWidgetView({…})` + summary for the model |
| `<module>_settings_data` | `...appOnly` (`visibility: "app"` + `openai/widgetAccessible`, no view) | `buildDataFeedResult(view)`                          |
| `<module>_save_settings` | none (plain model-visible tool)                                         | text summary + `structuredContent` = effective slice |

Two rules the save tool must honor:

- **Toolset gate.** The save is a durable write registered OUTSIDE the registrar, so the
  registrar's `withToolsetFilter` never sees it and it must gate itself — against your
  module's **declared** toolset names, never an `toolset === "read-only"` compare (that
  fails open for every other name the day a second restrictive toolset appears). Copy
  `packages/mcp-analytics/src/toolsets.ts`: a `<MODULE>_TOOLSETS` list, a type guard, and
  `allowsDurableWrites(toolset)` that fails open with a warning on unknown names. When it
  says no, skip registration; the view then reports `canSave: false` and the widget hides
  its Save button — the tool surface stays honest.
- **Merge over the RAW stored slice**, not the parsed one:

  ```ts
  const rawSlice = (await store.get(key))?.modules?.[MODULE_KEY]
  const nextSlice = { ...(isObject(rawSlice) ? rawSlice : {}), ...params }
  await save(
    key,
    { modules: { [MODULE_KEY]: nextSlice } },
    { userId: resolveSettingsAuthUserId(ctx) },
  )
  ```

  Parsing first would drop fields a newer build wrote and bake defaults into storage for
  fields the caller never set. A missing key throws — a save must fail visibly.

## Step 5 — the section widget

One self-fetching card, composed from `@miragon-ai/widget-shell/widgets` —
`SettingsCard` / `SettingsField` / `SettingsInput` / `NativeSelect`, never re-inlined:

- Self-fetch the `*_data` feed via `useToolQuery`, skipped when `data` props arrive from
  the `show_*` path (`{ enabled: !initialData }`).
- **Hide on unknown-tool, error on everything else**: an "…not found" rejection naming
  your feed means the module is inactive → `return null`. Any other failure stays visible
  through `QueryFallback` (a missing `isError` branch = eternal skeleton).
- Re-sync the form baseline from server truth via a value stamp in `useEffect` (feed
  refetch after save, another session's write).
- Write via `useToolMutation(SAVE_TOOL, { invalidateKeys: [[…]] })` so a remount seeds
  from the saved truth, not a stale cache entry.
- Render `<ModelContext content={describe…(view)} />` **inline**, not through
  `adaptDataWidget`'s `describeForModel`: the settings tab mounts the widget without
  pipeline data, so only the mounted component knows the self-fetched view.
- Everything user-visible goes through the module's `useT()` catalogs (`de` + `en`).

## Step 6 — registration (five links, one of them a peer edit)

1. `src/widgets/index.ts` — add the data-type constant + `adaptDataWidget(Widget, "<module>:settings")`
2. `src/definition.ts` — widget metadata (`id`, `description`, `requires: []`,
   `consumes: ["<module>:settings"]`, `size: "full"`); guarded against link 1 by
   `src/widgets/catalogue-sync.test.ts`
3. `apps/mcp-server-camunda7/src/ui/widget-registry.ts` — spreads the module's widget map;
   guarded by `apps/mcp-server-camunda7/test/widget-registry.test.ts` (every catalogued id
   must have an entry)
4. `src/tool-names.ts` — constants for the `*_data` feed and the save tool, so a rename
   trips TS at every widget call site
5. `packages/mcp-camunda7/src/widgets/cockpit-app/views.ts` → `cockpitViews.settings` —
   append `{ row: [{ widget: "<module>:settings", props: {} }] }`

Link 5 is the only place the settings page is not self-assembling: a hand-maintained list
living in a **peer** module. Both its failure modes are silent — a forgotten row means an
invisible section, a typo means a dropped cell — so
`apps/mcp-server-camunda7/test/widget-registry.test.ts` asserts it against both module
catalogues (convention: an id ending in `:settings` must appear in the layout, and every
listed id must resolve in the host registry). Add your section there and that test turns
green; forget it and it names exactly what is missing.

The id stays a raw string on purpose (tier-2 cross-module reference):
`HostWidgetsProvider` resolves it at runtime and `filterLayoutToWidgets` drops the cell +
emptied row when it resolves nowhere, so a host without your module degrades to "section
absent" instead of erroring.

Also add the three tool names to `apps/mcp-server-camunda7/test/expected-tools.ts`, and
document any new env var in `docs/operations.md` (see the `docs-style` skill).

## Step 7 — tests

Mirror `packages/mcp-analytics/src/settings.test.ts`:

- schema fills every default from `{}`
- save input keeps omitted fields **absent** (the zod-4 partial trap)
- `parseMySettings`: defaults for absent / garbage slice; ignores other modules' slices
- `settingsFor`: reads the slice; falls back to defaults on a store **outage**
- `registerSettingsTools`: save tool registered only with a writable store; dropped in the
  restrictive toolset; fails open on unknown names
- a round-trip through a fake store: keyless save → read back; partial save keeps the
  other saved value

Naming is load-bearing: `apps/mcp-server-camunda7/test/widget-contract.e2e.test.ts` checks
the widget `_meta` on every `*_show_*` tool and app-only visibility on every `*_data` feed
**by name**.

## Step 8 — verify

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint
```

`pnpm typecheck` is the **only** check covering widget `.tsx` code. Widget changes also
need `pnpm --filter @miragon-ai/mcp-server-camunda7 test:host` plus a manual render:
`docker compose -f playground/docker/docker-compose.yml up -d`, `pnpm dev`, open the
settings tab via `<module>_show_settings` in the inspector at
`http://localhost:8400/inspector`. Exercise Save and reload — a value that doesn't survive
the reload means the merge or the key resolution is wrong. Run `pnpm format:check` before
committing.

## Anti-patterns

- Putting module vocabulary into `userProfilePreferencesSchema` instead of the slice.
- `.partial()` over a defaulted schema at the tool boundary (silent resets).
- Parsing the slice before merging in the save path (loses newer builds' fields).
- Reading `profile.modules.<other>` — foreign slices are their owner's business.
- Importing another `mcp-*` module to reach its settings; share via
  `@miragon-ai/widget-shell` or a structural port instead.
- Re-deriving the profile key or the anonymous fallback locally instead of importing
  them — the drift is invisible until a user's settings sit in two records.
- A save tool that ignores the toolset, or a widget that shows Save when `canSave` is false.
- Renaming a slice field without thinking about the stored records: `safeParse` +
  defaults means the old value is silently dropped: migrate it in your own read path or
  accept (and state) the reset.
