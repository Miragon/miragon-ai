import { cloneElement, useEffect, useId, useState, type ReactElement } from "react"
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  useToolMutation,
  useToolQuery,
} from "@miragon/mcp-toolkit-ui"
import { ModelContext } from "mcp-use/react"
import { NativeSelect, WidgetShell, useDetailView } from "@miragon-ai/widget-shell/widgets"

import { CAMUNDA7_SAVE_USER_PROFILE, CAMUNDA7_USER_PROFILE_DATA } from "../tool-names.js"
import {
  ANALYTICS_PERIODS,
  LOCALES,
  ROLES,
  THEMES,
  type AnalyticsPeriod,
  type Locale,
  type Role,
  type ThemePref,
} from "../lib/profile-constants.js"
import type { UserProfile, UserProfileView } from "../lib/profile-schema.js"
import { useT } from "../messages/use-t.js"
import { refreshCockpitData } from "./refresh.js"

/** Subset of a dashboard summary the picker needs (from `list-dashboards`). */
interface DashboardSummary {
  id: string
  name: string
  title?: string
}

/** Language names are endonyms — shown in their own language, not the UI locale. */
const LANGUAGE_LABELS: Record<Locale, string> = { en: "English", de: "Deutsch" }

/** The editable preference state mirrored by the form controls. */
interface FormState {
  language: Locale
  theme: ThemePref
  allowedEngineIds: string[]
  defaultEngineId: string
  defaultDashboardId: string
  pinnedDashboardIds: string[]
  analyticsDefaultPeriod: AnalyticsPeriod
  /** Raw input text — clamped/parsed only on save, so typing stays free. */
  analyticsMinBucketSize: string
  preferredRole: "" | Role
}

/** Narrow a `<select>` value back to its constant array without a cast. */
function parseEnum<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

function fromProfile(p: UserProfile, engineIds: string[]): FormState {
  return {
    language: p.language,
    theme: p.theme,
    // Empty/absent allow-list means "all" — render every engine as checked.
    allowedEngineIds:
      p.allowedEngineIds && p.allowedEngineIds.length > 0 ? p.allowedEngineIds : engineIds,
    defaultEngineId: p.defaultEngineId ?? "",
    defaultDashboardId: p.defaultDashboardId ?? "",
    pinnedDashboardIds: p.pinnedDashboardIds ?? [],
    analyticsDefaultPeriod: p.analyticsDefaultPeriod,
    analyticsMinBucketSize: String(p.analyticsMinBucketSize),
    preferredRole: p.preferredRole ?? "",
  }
}

const labelCls = "text-foreground text-sm font-medium"
const helpCls = "text-muted-foreground text-xs"
const inputCls =
  "border-border bg-background text-foreground h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-ring focus-visible:ring-2"

function Field({
  label,
  help,
  group = false,
  children,
}: {
  label: string
  help?: string
  /** Checkbox-group fields: labelled via role="group" (no single control to point htmlFor at). */
  group?: boolean
  children: ReactElement<{ id?: string }>
}) {
  const id = useId()
  const labelId = `${id}-label`
  return (
    <div className="flex flex-col gap-1.5">
      {group ? (
        <span id={labelId} className={labelCls}>
          {label}
        </span>
      ) : (
        <label htmlFor={id} className={labelCls}>
          {label}
        </label>
      )}
      {group ? (
        <div role="group" aria-labelledby={labelId}>
          {children}
        </div>
      ) : (
        cloneElement(children, { id })
      )}
      {help && <span className={helpCls}>{help}</span>}
    </div>
  )
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardContent className="flex flex-col gap-4 p-4">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        {children}
      </CardContent>
    </Card>
  )
}

/**
 * Profile & settings panel. Self-fetches the current session's profile +
 * configured engine list (or receives it via `initialData` from the
 * `camunda7_show_user_profile` tool), applies the profile theme, and provides
 * the profile language to its own subtree so the panel is localized in both the
 * cockpit settings tab and a standalone render.
 */
export function UserProfileWidget({ data: initialData = null }: { data?: UserProfileView | null }) {
  const t = useT()
  const { data: view, guard } = useDetailView<UserProfileView>({
    initialData,
    key: ["camunda7:user-profile"],
    tool: CAMUNDA7_USER_PROFILE_DATA,
    args: {},
    ready: true,
    loadingText: t("profile.loading"),
    emptyText: t("profile.none"),
  })

  if (!view) return guard

  return (
    <WidgetShell>
      <ProfilePanel view={view} />
    </WidgetShell>
  )
}

/**
 * The shell-less form body — localized via `useT` (locale from the global
 * ProfileGate). Wrapped in `WidgetShell` by `UserProfileWidget` above.
 */
function ProfilePanel({ view }: { view: UserProfileView }) {
  const t = useT()
  const dashboardsQuery = useToolQuery<{ items: DashboardSummary[] }>(
    ["dashboards"],
    "list-dashboards",
    {},
  )
  const dashboards = dashboardsQuery.data?.items ?? []

  const save = useToolMutation(CAMUNDA7_SAVE_USER_PROFILE)
  const [form, setForm] = useState<FormState>(() =>
    fromProfile(
      view.profile,
      view.availableEngines.map((e) => e.id),
    ),
  )
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // Re-sync the baseline after a save (the feed refetches via refreshCockpitData).
  const profileStamp = view.profile.updatedAt
  useEffect(() => {
    setForm(
      fromProfile(
        view.profile,
        view.availableEngines.map((e) => e.id),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileStamp])

  const engines = view.availableEngines
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  function toggleEngine(id: string, on: boolean) {
    setForm((f) => {
      const next = on
        ? Array.from(new Set([...f.allowedEngineIds, id]))
        : f.allowedEngineIds.filter((e) => e !== id)
      // Drop a now-disallowed default so we never persist an unreachable default.
      const defaultEngineId = next.includes(f.defaultEngineId) ? f.defaultEngineId : ""
      return { ...f, allowedEngineIds: next, defaultEngineId }
    })
  }

  function togglePinned(id: string, on: boolean) {
    setForm((f) => {
      const next = on
        ? Array.from(new Set([...f.pinnedDashboardIds, id]))
        : f.pinnedDashboardIds.filter((d) => d !== id)
      return { ...f, pinnedDashboardIds: next }
    })
  }

  function handleSave() {
    // Everything checked persists as [] — the documented "all engines"
    // encoding — so engines configured later are included automatically
    // instead of freezing today's expanded list.
    const engineIdSet = new Set(engines.map((e) => e.id))
    const allEnginesChecked =
      engineIdSet.size > 0 &&
      form.allowedEngineIds.length === engineIdSet.size &&
      form.allowedEngineIds.every((id) => engineIdSet.has(id))
    save.mutate(
      {
        language: form.language,
        theme: form.theme,
        allowedEngineIds: allEnginesChecked ? [] : form.allowedEngineIds,
        defaultEngineId: form.defaultEngineId,
        defaultDashboardId: form.defaultDashboardId,
        pinnedDashboardIds: form.pinnedDashboardIds,
        analyticsDefaultPeriod: form.analyticsDefaultPeriod,
        analyticsMinBucketSize: Math.max(1, Number.parseInt(form.analyticsMinBucketSize, 10) || 1),
        // "" = unset → omit so the enum stays valid and the value is unchanged.
        ...(form.preferredRole ? { preferredRole: form.preferredRole } : {}),
      },
      {
        onSuccess: () => {
          setSavedAt(new Date().toLocaleTimeString())
          refreshCockpitData()
        },
      },
    )
  }

  const allEnginesAllowed = form.allowedEngineIds.length >= engines.length

  return (
    <>
      <ModelContext
        content={`Support is on the MiragonAI profile & settings panel. Current preferences — language ${form.language}, theme ${form.theme}, ${allEnginesAllowed ? "all engines available" : `${form.allowedEngineIds.length} engine(s) available`}. Preferences can be changed here or via camunda7_save_user_profile.`}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t("profile.heading")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t("profile.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && !save.isPending && (
            <Badge variant="secondary">{t("profile.saved", { time: savedAt })}</Badge>
          )}
          <Button size="sm" onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? t("profile.saving") : t("profile.save")}
          </Button>
        </div>
      </div>

      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{save.error?.message ?? t("profile.saveError")}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingsCard title={t("profile.section.appearance")}>
          <Field label={t("profile.field.language")} help={t("profile.field.language.help")}>
            <NativeSelect
              value={form.language}
              onChange={(e) => set("language", parseEnum(e.target.value, LOCALES) ?? form.language)}
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("profile.field.theme")}>
            <NativeSelect
              value={form.theme}
              onChange={(e) => set("theme", parseEnum(e.target.value, THEMES) ?? form.theme)}
            >
              {THEMES.map((th) => (
                <option key={th} value={th}>
                  {t(`theme.${th}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("profile.field.role")} help={t("profile.field.role.help")}>
            <NativeSelect
              value={form.preferredRole}
              onChange={(e) => set("preferredRole", parseEnum(e.target.value, ROLES) ?? "")}
            >
              <option value="">{t("profile.role.unset")}</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </SettingsCard>

        <SettingsCard title={t("profile.section.engines")}>
          <Field
            label={t("profile.field.allowedEngines")}
            help={t("profile.field.allowedEngines.help")}
            group
          >
            <div className="flex flex-col gap-1.5">
              {engines.length === 0 && <span className={helpCls}>{t("profile.engines.none")}</span>}
              {engines.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.allowedEngineIds.includes(e.id)}
                    onChange={(ev) => toggleEngine(e.id, ev.target.checked)}
                  />
                  <span className="font-mono">{e.id}</span>
                  <span className={helpCls}>{e.baseUrl}</span>
                </label>
              ))}
            </div>
          </Field>
          <Field
            label={t("profile.field.defaultEngine")}
            help={t("profile.field.defaultEngine.help")}
          >
            <NativeSelect
              value={form.defaultEngineId}
              onChange={(e) => set("defaultEngineId", e.target.value)}
            >
              <option value="">{t("profile.engine.auto")}</option>
              {engines
                .filter((e) => form.allowedEngineIds.includes(e.id))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        </SettingsCard>

        <SettingsCard title={t("profile.section.dashboards")}>
          {dashboardsQuery.isError ? (
            <span className={helpCls}>{t("profile.dashboards.unavailable")}</span>
          ) : dashboards.length === 0 ? (
            <span className={helpCls}>{t("profile.dashboards.empty")}</span>
          ) : (
            <>
              <Field
                label={t("profile.field.defaultDashboard")}
                help={t("profile.field.defaultDashboard.help")}
              >
                <NativeSelect
                  value={form.defaultDashboardId}
                  onChange={(e) => set("defaultDashboardId", e.target.value)}
                >
                  <option value="">{t("profile.dashboard.none")}</option>
                  {dashboards.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title ?? d.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label={t("profile.field.pinnedDashboards")}
                help={t("profile.field.pinnedDashboards.help")}
                group
              >
                <div className="flex flex-col gap-1.5">
                  {dashboards.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.pinnedDashboardIds.includes(d.id)}
                        onChange={(ev) => togglePinned(d.id, ev.target.checked)}
                      />
                      <span>{d.title ?? d.name}</span>
                    </label>
                  ))}
                </div>
              </Field>
            </>
          )}
        </SettingsCard>

        <SettingsCard title={t("profile.section.analytics")}>
          <Field
            label={t("profile.field.analyticsPeriod")}
            help={t("profile.field.analyticsPeriod.help")}
          >
            <NativeSelect
              value={form.analyticsDefaultPeriod}
              onChange={(e) =>
                set(
                  "analyticsDefaultPeriod",
                  parseEnum(e.target.value, ANALYTICS_PERIODS) ?? form.analyticsDefaultPeriod,
                )
              }
            >
              {ANALYTICS_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("profile.field.minBucket")} help={t("profile.field.minBucket.help")}>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={form.analyticsMinBucketSize}
              onChange={(e) => set("analyticsMinBucketSize", e.target.value)}
            />
          </Field>
        </SettingsCard>
      </div>
    </>
  )
}
