import { useEffect, useState } from "react"
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
import { useViewData } from "./use-view-data.js"
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
  analyticsMinBucketSize: number
  preferredRole: "" | Role
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
    analyticsMinBucketSize: p.analyticsMinBucketSize,
    preferredRole: p.preferredRole ?? "",
  }
}

const labelCls = "text-foreground text-sm font-medium"
const helpCls = "text-muted-foreground text-xs"
const selectCls =
  "border-border bg-background text-foreground h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-ring focus-visible:ring-2"

function Field({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      {children}
      {help && <span className={helpCls}>{help}</span>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
  const {
    data: view,
    loading,
    error,
  } = useViewData<UserProfileView>(
    initialData,
    ["camunda7:user-profile"],
    CAMUNDA7_USER_PROFILE_DATA,
    {},
    true,
  )

  const t = useT()

  if (!view) {
    return (
      <div className="bg-card text-card-foreground p-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="text-muted-foreground text-sm">
            {loading ? t("profile.loading") : t("profile.none")}
          </div>
        )}
      </div>
    )
  }

  return <ProfilePanel view={view} />
}

/** The form body — localized via `useT` (locale from the global ProfileGate). */
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
    save.mutate(
      {
        language: form.language,
        theme: form.theme,
        allowedEngineIds: form.allowedEngineIds,
        defaultEngineId: form.defaultEngineId,
        defaultDashboardId: form.defaultDashboardId,
        pinnedDashboardIds: form.pinnedDashboardIds,
        analyticsDefaultPeriod: form.analyticsDefaultPeriod,
        analyticsMinBucketSize: form.analyticsMinBucketSize,
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
    <div className="bg-card text-card-foreground flex flex-col gap-5 p-6">
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
          <Button onClick={handleSave} disabled={save.isPending}>
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
        <Section title={t("profile.section.appearance")}>
          <Field label={t("profile.field.language")} help={t("profile.field.language.help")}>
            <select
              className={selectCls}
              value={form.language}
              onChange={(e) => set("language", e.target.value as Locale)}
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("profile.field.theme")}>
            <select
              className={selectCls}
              value={form.theme}
              onChange={(e) => set("theme", e.target.value as ThemePref)}
            >
              {THEMES.map((th) => (
                <option key={th} value={th}>
                  {t(`theme.${th}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("profile.field.role")} help={t("profile.field.role.help")}>
            <select
              className={selectCls}
              value={form.preferredRole}
              onChange={(e) => set("preferredRole", e.target.value as "" | Role)}
            >
              <option value="">{t("profile.role.unset")}</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title={t("profile.section.engines")}>
          <Field
            label={t("profile.field.allowedEngines")}
            help={t("profile.field.allowedEngines.help")}
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
            <select
              className={selectCls}
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
            </select>
          </Field>
        </Section>

        <Section title={t("profile.section.dashboards")}>
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
                <select
                  className={selectCls}
                  value={form.defaultDashboardId}
                  onChange={(e) => set("defaultDashboardId", e.target.value)}
                >
                  <option value="">{t("profile.dashboard.none")}</option>
                  {dashboards.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title ?? d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("profile.field.pinnedDashboards")}
                help={t("profile.field.pinnedDashboards.help")}
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
        </Section>

        <Section title={t("profile.section.analytics")}>
          <Field
            label={t("profile.field.analyticsPeriod")}
            help={t("profile.field.analyticsPeriod.help")}
          >
            <select
              className={selectCls}
              value={form.analyticsDefaultPeriod}
              onChange={(e) => set("analyticsDefaultPeriod", e.target.value as AnalyticsPeriod)}
            >
              {ANALYTICS_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("profile.field.minBucket")} help={t("profile.field.minBucket.help")}>
            <input
              type="number"
              min={1}
              className={selectCls}
              value={form.analyticsMinBucketSize}
              onChange={(e) =>
                set("analyticsMinBucketSize", Math.max(1, Number(e.target.value) || 1))
              }
            />
          </Field>
        </Section>
      </div>
    </div>
  )
}
