import type { LanguagePref, Locale } from "@miragon-ai/widget-shell/widgets"
import type { UserProfile } from "../lib/profile-schema.js"

/**
 * The settings panel's form model (#322 U25): what the controls edit, how it
 * maps from the stored profile and back to a save that sends only what the
 * user changed. Pure — `user-profile.tsx` holds the state, the sections in
 * `user-profile-sections.tsx` render it.
 */

/** Subset of a dashboard summary the picker needs (from `list-dashboards`). */
export interface DashboardSummary {
  id: string
  name: string
  title?: string
  /**
   * Set (since toolkit 2.6) when the store holds the record but cannot read
   * it — a newer `schemaVersion` mid rolling upgrade, a corrupt row. Its
   * `name` is then just the id, and `load-dashboard` refuses it.
   */
  unreadable?: string
}

/**
 * The dashboards the picker offers: unreadable records left out (they could
 * be chosen but never opened), pinned ones first — the one behavior the pin
 * promises. A saved default or pin that points at an unreadable record stays
 * in the form state untouched, so it survives until the record reads again.
 */
export function pickableDashboards(
  items: DashboardSummary[],
  pinnedIds: string[],
): DashboardSummary[] {
  return items
    .filter((d) => d.unreadable === undefined)
    .sort((a, b) => Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id)))
}

/** Language names are endonyms — shown in their own language, not the UI locale. */
export const LANGUAGE_LABELS: Record<Locale, string> = { en: "English", de: "Deutsch" }

/** The editable preference state mirrored by the form controls. */
export interface FormState {
  language: LanguagePref
  /** "Alle Engines erlauben" (#322 U25): every configured engine, today's and tomorrow's. */
  allEngines: boolean
  /** The curated engines while `allEngines` is off. */
  allowedEngineIds: string[]
  defaultEngineId: string
  defaultDashboardId: string
  pinnedDashboardIds: string[]
}

/** Narrow a `<select>` value back to its constant array without a cast. */
export function parseEnum<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

export function fromProfile(p: UserProfile, engineIds: string[]): FormState {
  // An empty/absent allow-list means "all"; switched off, the list starts
  // with every engine checked.
  const curated = !!p.allowedEngineIds && p.allowedEngineIds.length > 0
  return {
    language: p.language,
    allEngines: !curated,
    allowedEngineIds: curated ? (p.allowedEngineIds ?? []) : engineIds,
    defaultEngineId: p.defaultEngineId ?? "",
    defaultDashboardId: p.defaultDashboardId ?? "",
    pinnedDashboardIds: p.pinnedDashboardIds ?? [],
  }
}

/** The engines the form allows: every one, or the curated list. */
export function allowedIn(form: FormState, engineIds: string[]): string[] {
  return form.allEngines ? engineIds : form.allowedEngineIds
}

/** The form compared with what is stored: has the user changed anything? */
export function isDirty(form: FormState, baseline: FormState, engineIds: string[]): boolean {
  return Object.keys(changedPreferences(form, baseline, engineIds)).length > 0
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

/** The single-valued preferences, compared by value. */
const SCALAR_FIELDS = ["language", "defaultEngineId", "defaultDashboardId"] as const

/**
 * The save payload: ONLY the preferences the user changed against the form's
 * baseline. The panel may render from a cached (stale) view, and another
 * writer (the model's `camunda7_select_engine`, a second tab) may have
 * changed the profile meanwhile — re-sending untouched fields would silently
 * write the old values back. The save input is default-free, so an omitted
 * field stays unchanged on the server.
 */
export function changedPreferences(
  form: FormState,
  baseline: FormState,
  engineIds: string[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of SCALAR_FIELDS) {
    if (form[field] !== baseline[field]) payload[field] = form[field]
  }
  if (!sameSet(form.pinnedDashboardIds, baseline.pinnedDashboardIds)) {
    payload.pinnedDashboardIds = form.pinnedDashboardIds
  }
  const allowed = allowedIn(form, engineIds)
  if (!sameSet(allowed, allowedIn(baseline, engineIds))) {
    // "All engines" — switched on, or everything checked — persists as [],
    // the documented "all engines" encoding, so engines configured later are
    // included automatically instead of freezing today's expanded list.
    payload.allowedEngineIds = form.allEngines || sameSet(allowed, engineIds) ? [] : allowed
  }
  return payload
}
