import { z } from "zod"
import { PERIODS } from "@miragon-ai/analytics-client"
import type { ProfileSource } from "./server-locale.js"
import { resolveSettingsKey } from "./server-locale.js"

/**
 * The analytics module's OWN settings slice, persisted under
 * `profile.modules.analytics` in the shared profile record (see the camunda7
 * `modules` field — the profile transports the slice, this module owns its
 * schema). Read fail-soft: a missing/foreign slice yields the defaults, so a
 * stale or hand-edited record can never break analytics tools.
 */
export const analyticsSettingsSchema = z.object({
  defaultPeriod: z
    .enum(PERIODS)
    .default("7d")
    .describe("Default look-back window applied when an analytics call omits `period`."),
  minBucketSize: z
    .number()
    .int()
    .min(1)
    .default(10)
    .describe(
      "Default minimum per-window instance count before comparison results are flagged `suppressed`, applied when a compare call omits `minBucketSize`.",
    ),
})

export type AnalyticsSettings = z.infer<typeof analyticsSettingsSchema>

/**
 * The save tool's input — deliberately default-FREE: zod 4 re-applies
 * `.default()`s through `.partial()` on parse, so a defaulted partial would
 * materialize omitted fields at the tool boundary and a "single-field" save
 * would silently reset the other saved value. With this shape, omitted keys
 * stay absent and the handler's merge keeps them unchanged.
 *
 * Spelled out by hand because the save descriptions differ from the schema's
 * ("Omitted → unchanged" is what the model needs at a write boundary). When the
 * descriptions can be shared, derive it instead:
 * `z.object(withoutDefaults(analyticsSettingsSchema.shape)).partial()`
 * (`withoutDefaults` from `@miragon-ai/widget-shell/server`) — which is what
 * camunda7's `userProfileSaveInput` does.
 */
export const analyticsSettingsSaveInput = z.object({
  defaultPeriod: z
    .enum(PERIODS)
    .optional()
    .describe("New default look-back period. Omitted → unchanged."),
  minBucketSize: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("New minimum comparison bucket size. Omitted → unchanged."),
})

/**
 * `period` at the tool boundary is optional (no zod default) so an omitted
 * value is distinguishable and can fall back to the user's saved analytics
 * default before the schema default applies. Derived from PERIODS — never a
 * copied enum. Shared by the widget tools and the registrar tools.
 */
export const optionalPeriod = z
  .enum(PERIODS)
  .optional()
  .describe("Analysis time period. Omitted → the user's saved analytics default (else 7d).")

/** Same optional-at-the-boundary treatment for `minBucketSize`. */
export const optionalMinBucketSize = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe(
    "Minimum per-window instance count before results are flagged `suppressed`. Omitted → the user's saved analytics default (else 10).",
  )

/** The module's slice key inside `profile.modules`. */
export const ANALYTICS_MODULE_KEY = "analytics"

/** The slice parsed leniently: garbage or absence yields the defaults. */
export function parseAnalyticsSettings(
  modules: Record<string, unknown> | undefined,
): AnalyticsSettings {
  const parsed = analyticsSettingsSchema.safeParse(modules?.[ANALYTICS_MODULE_KEY] ?? {})
  return parsed.success ? parsed.data : analyticsSettingsSchema.parse({})
}

/**
 * Resolve the request's effective analytics settings from the shared profile
 * store — the single place tools apply the "explicit arg > saved setting >
 * schema default" precedence for `period`/`minBucketSize`. Fail-soft on every
 * axis: no store, no resolvable key, or a store OUTAGE all yield the schema
 * defaults — a profile-store hiccup must never fail an analytics read that
 * only needs Prometheus.
 */
export async function settingsFor(
  store: ProfileSource | undefined,
  ctx?: unknown,
): Promise<AnalyticsSettings> {
  if (!store) return analyticsSettingsSchema.parse({})
  const key = resolveSettingsKey(ctx)
  if (!key) return analyticsSettingsSchema.parse({})
  try {
    const profile = await store.get(key)
    return parseAnalyticsSettings(profile?.modules)
  } catch {
    return analyticsSettingsSchema.parse({})
  }
}
