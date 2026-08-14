---
name: add-settings-section
description: Step-by-step house pattern for giving your module persisted per-user settings — a schema under `profile.modules.<module>`, the show/data/save tool triple, and a settings widget. Use whenever adding or changing persisted user preferences ("make X configurable per user", "add a setting for Y", "remember this default"), or anything touching the user-profile record from a custom module.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# add-settings-section — per-user settings for your module

Settings live in ONE profile record per user/session, shared by all modules —
that is the `profileStore` the server threads into every module via
`SharedResources`. The record itself is platform-owned and connector-free
(`language`, `theme`, metadata); your module owns a **slice** under
`profile.modules.<module>`: the record only transports it, your module owns its
schema, validates it fail-soft on read, and writes it through its own save
tool. The store merges per module key, so your save never touches another
module's slice — and you never read another module's slice either.

**Reference implementation** (the notes module has no settings; the published
analytics module is the canonical one — its sources ship in `node_modules`):

- `node_modules/@miragon-ai/analytics-connector/src/settings.ts` — slice schema,
  fail-soft parse, "explicit arg > saved setting > default"
- `.../src/settings-tools.ts` — the tool triple + toolset gate
- `.../src/widgets/settings-section.tsx` — the section widget
- `.../src/settings.test.ts` — the test set to mirror

## Step 1 — the slice schema (`src/settings.ts`)

```ts
export const MODULE_KEY = "<module>" // the key inside profile.modules

export const mySettingsSchema = z.object({
  someDefault: z.enum(THINGS).default("a").describe("…applied when a call omits `thing`."),
})

/** Fail-soft: a missing, foreign, or hand-edited slice yields the defaults. */
export function parseMySettings(modules: Record<string, unknown> | undefined): MySettings {
  const parsed = mySettingsSchema.safeParse(modules?.[MODULE_KEY] ?? {})
  return parsed.success ? parsed.data : mySettingsSchema.parse({})
}
```

Every field gets a `.default()` — a never-saved slice must still yield a
complete, renderable object. Then one `settingsFor(store, ctx)` helper as the
single place tools read the slice: return defaults when the store is absent,
when no profile key resolves, **and when the store read throws** — a
profile-store hiccup must never fail a read that only needs your backend. At
the tool boundary the affected input becomes `.optional()` (no zod default) so
"omitted" stays distinguishable from "explicitly set".

## Step 2 — the save input must be default-FREE

**The trap:** zod 4 re-applies `.default()`s THROUGH `.partial()` on parse, so
a defaulted partial materializes omitted fields at the tool boundary — a
"single-field" save then silently resets every other value. Derive the save
input instead of hand-writing it:

```ts
import { withoutDefaults } from "@miragon-ai/widget-shell/server"
export const mySettingsSaveInput = z.object(withoutDefaults(mySettingsSchema.shape)).partial()
```

Cover it with a test asserting omitted keys stay **absent** after the parse
(see "keeps omitted fields ABSENT" in the analytics settings tests).

## Step 3 — profile access (import, never reimplement)

Every module reads and writes the SAME record, so whose profile a request
touches is a shared contract — a module-local copy of the precedence would
silently split one user's settings across two records:

```ts
import {
  resolveProfileKey, // auth user id > Mcp-Session-Id > anonymous (stdio/tests) > undefined
  resolveAuthUserId, // stamped as opts.userId on save → record exempt from session-TTL cleanup
  type ProfileSource, // the narrow read/write port a module consumes
} from "@miragon-ai/widget-shell/server"
```

The store arrives via `shared.profileStore` in `createPlugin` — add
`profileStore?: ProfileSource` to your module's structural shared-resources
interface (the field is already documented in `modules/mcp-notes/src/module.ts`)
and treat it as optional. `save` is optional on the port too: no store or no
`save` means the section is read-only — skip registering the save tool and
report `canSave: false`.
`resolveProfileKey` returning `undefined` (HTTP request without a session id)
means reads fall back to defaults and saves must fail **visibly** — keyless
clients must never share one record.

## Step 4 — the tool triple (`src/settings-tools.ts`)

Three render paths, three tools — the naming is load-bearing (the server's
wire-contract e2e test asserts by name):

| Tool                     | Binding                           | Returns                                              |
| ------------------------ | --------------------------------- | ---------------------------------------------------- |
| `<module>_show_settings` | `...showToolBinding(name, title)` | `buildSingleWidgetView({…})` + summary for the model |
| `<module>_settings_data` | `...appOnly`                      | `buildDataFeedResult(view)`                          |
| `<module>_save_settings` | none (plain model-visible tool)   | text summary + `structuredContent` = effective slice |

Rules the save tool must honor:

- **Merge over the RAW stored slice, not the parsed one** — parsing first would
  drop fields a newer build wrote and bake defaults into storage:

  ```ts
  const rawSlice = (await store.get(key))?.modules?.[MODULE_KEY]
  const nextSlice = { ...(isObject(rawSlice) ? rawSlice : {}), ...params }
  await store.save(
    key,
    { modules: { [MODULE_KEY]: nextSlice } },
    { userId: resolveAuthUserId(ctx) },
  )
  ```

  A missing key throws — a save must fail visibly, never silently no-op.

- **Toolset gate** (only if your module `supportsToolsets`): the save is a
  durable write registered outside the registrar, so it must gate itself —
  against your declared toolset names, failing CLOSED on unknown ones (see the
  create-module skill, Step 5). When the toolset forbids writes, skip
  registering the save tool AND report `canSave: false` in the view, so the
  widget shows disabled fields instead of a Save button that resolves to an
  unknown tool.

## Step 5 — the section widget

One self-fetching card composed from `@miragon-ai/widget-shell/widgets` —
`SettingsCard` / `SettingsField` / `SettingsInput` / `NativeSelect`:

- Self-fetch the `*_data` feed via `useToolQuery`, `{ enabled: !initialData }`.
- Show errors through `QueryFallback` — a missing `isError` branch is an
  eternal skeleton.
- Save via `useToolMutation(SAVE_TOOL, { invalidateKeys: [[…]] })` and re-sync
  the form baseline from server truth after the refetch.
- Hide Save (render disabled fields) when the view says `canSave: false`.

Register it through the four-link chain (see the add-widget skill). **One
template-specific naming rule:** give the widget an id that does NOT end in
`:settings` — e.g. `<module>:preferences`. The camunda7 cockpit's settings tab
is composed from a layout owned by the published camunda7 package, which cannot
list your widget; the server guard (`server/test/widget-registry.test.ts`)
reserves the `:settings` suffix for sections that tab actually renders and
fails on any other — correctly, because such a section would be silently
invisible. Your section is reached through your own `<module>_show_settings`
tool instead. (The **tool** names in Step 4 keep the `settings` wording — the
convention there is `_show_`/`_data`, which they satisfy.)

## Step 6 — tests, then verify

Mirror the analytics settings test set in your module: schema fills every
default from `{}`; save input keeps omitted fields absent; `parseMySettings`
yields defaults for absent/garbage slices and ignores foreign slices;
`settingsFor` survives a store outage; a round-trip through a fake store keeps
the other saved value on a partial save.

```bash
pnpm build && pnpm typecheck && pnpm test
```

Then in the inspector: call `<module>_show_settings`, save a value, reload the
widget — a value that doesn't survive the reload means the merge or the key
resolution is wrong.

## Anti-patterns

- Re-deriving the profile key or anonymous fallback locally instead of
  importing `resolveProfileKey` — the drift is invisible until one user's
  settings sit in two records.
- `.partial()` over a defaulted schema at the tool boundary (silent resets).
- Parsing the slice before merging in the save path (drops newer builds' fields).
- Reading or writing `profile.modules.<other>` — foreign slices are their
  owner's business.
- A save tool that ignores the toolset, or a widget showing Save when
  `canSave` is false.
- Renaming a slice field without a plan for stored records: `safeParse` +
  defaults silently drops the old value — migrate it in your own read path or
  accept (and state) the reset.
