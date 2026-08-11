import { useEffect, useState } from "react"
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  useToolMutation,
  useToolQuery,
} from "@miragon/mcp-toolkit-ui"
import { HostModelContext } from "@miragon/mcp-toolkit-ui/app"
import {
  NativeSelect,
  QueryFallback,
  SettingsCard,
  SettingsField,
  SettingsInput,
  WidgetShell,
  formatTime,
} from "@miragon-ai/widget-shell/widgets"
import { PERIODS, type Period } from "@miragon-ai/client-analytics"
import { ANALYTICS_SAVE_SETTINGS, ANALYTICS_SETTINGS_DATA } from "../tool-names.js"
import { useT } from "../messages/use-t.js"
import { describeAnalyticsSettings } from "./model-descriptions.js"

/**
 * Wire shape of the `analytics_settings_data` feed / `analytics_show_settings`
 * data (see `settings-tools.ts`). Declared structurally here so the widget
 * bundle stays free of server-side imports.
 */
export interface AnalyticsSettingsViewData {
  settings: { defaultPeriod: Period; minBucketSize: number }
  canSave: boolean
}

/**
 * The analytics module's settings section — one card the settings page
 * composes next to the camunda7 profile panel. Self-fetches its app-only feed;
 * when the feed TOOL is missing (analytics module inactive) the section hides
 * itself, mirroring the tier-2 graceful degradation of
 * `process-incidents/flow.tsx`. Any other failure (profile store outage,
 * network) stays visible as an error state instead of silently vanishing.
 */
export function AnalyticsSettingsWidget({
  data: initialData = null,
}: {
  data?: AnalyticsSettingsViewData | null
}) {
  const t = useT()
  const query = useToolQuery<AnalyticsSettingsViewData>(
    ["analytics:settings"],
    ANALYTICS_SETTINGS_DATA,
    {},
    { enabled: !initialData },
  )
  const view = initialData ?? query.data ?? null

  if (!view) {
    if (query.isError) {
      const message = query.error instanceof Error ? query.error.message : String(query.error)
      // The unknown-tool rejection = module inactive → hide the section.
      if (message.includes(ANALYTICS_SETTINGS_DATA) && /not found/i.test(message)) return null
    }
    return (
      <WidgetShell>
        <QueryFallback
          isError={query.isError}
          error={query.error}
          errorTitle={t("aCommon.loadError")}
          skeleton={<div className="bg-muted/50 h-24 animate-pulse rounded-md" aria-hidden />}
        />
      </WidgetShell>
    )
  }

  return (
    <WidgetShell>
      <SettingsPanel view={view} />
    </WidgetShell>
  )
}

/** Raw form state — free typing, clamped/parsed only on save. */
interface FormState {
  defaultPeriod: Period
  minBucketSize: string
}

function SettingsPanel({ view }: { view: AnalyticsSettingsViewData }) {
  const t = useT()
  // invalidateKeys: after a save the feed refetches, so a remounted section
  // seeds from the saved server truth instead of the stale cache entry.
  const save = useToolMutation(ANALYTICS_SAVE_SETTINGS, {
    invalidateKeys: [["analytics:settings"]],
  })
  const [form, setForm] = useState<FormState>({
    defaultPeriod: view.settings.defaultPeriod,
    minBucketSize: String(view.settings.minBucketSize),
  })
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // Re-sync the baseline when server truth changes (feed refetch after save,
  // refreshCockpitData from the camunda7 panel, another session's write) —
  // mirrors user-profile.tsx; the feed carries no updatedAt, so the values
  // themselves are the stamp.
  const settingsStamp = `${view.settings.defaultPeriod}|${view.settings.minBucketSize}`
  useEffect(() => {
    setForm({
      defaultPeriod: view.settings.defaultPeriod,
      minBucketSize: String(view.settings.minBucketSize),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsStamp])

  function handleSave() {
    save.mutate(
      {
        defaultPeriod: form.defaultPeriod,
        minBucketSize: Math.max(1, Number.parseInt(form.minBucketSize, 10) || 1),
      },
      { onSuccess: () => setSavedAt(formatTime(new Date().toISOString())) },
    )
  }

  return (
    /* Inline (not via adaptDataWidget): the cockpit settings tab renders this
       widget without pipeline data, and only the mounted component knows the
       self-fetched view. HostModelContext renders its children unchanged. */
    <HostModelContext content={describeAnalyticsSettings(view, {})}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t("aSettings.heading")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t("aSettings.subtitle")}</p>
        </div>
        {view.canSave && (
          <div className="flex items-center gap-2">
            {savedAt && !save.isPending && (
              <Badge variant="secondary">{t("aSettings.saved", { time: savedAt })}</Badge>
            )}
            <Button size="sm" onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? t("aSettings.saving") : t("aSettings.save")}
            </Button>
          </div>
        )}
      </div>

      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{save.error?.message ?? t("aSettings.saveError")}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingsCard title={t("aSettings.section")}>
          <SettingsField label={t("aSettings.period")} help={t("aSettings.period.help")}>
            <NativeSelect
              value={form.defaultPeriod}
              disabled={!view.canSave}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  defaultPeriod: (PERIODS as readonly string[]).includes(e.target.value)
                    ? (e.target.value as Period)
                    : f.defaultPeriod,
                }))
              }
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </NativeSelect>
          </SettingsField>
          <SettingsField label={t("aSettings.minBucket")} help={t("aSettings.minBucket.help")}>
            <SettingsInput
              type="number"
              min={1}
              disabled={!view.canSave}
              value={form.minBucketSize}
              onChange={(e) => setForm((f) => ({ ...f, minBucketSize: e.target.value }))}
            />
          </SettingsField>
          {!view.canSave && (
            <span className="text-muted-foreground text-xs">{t("aSettings.readOnly")}</span>
          )}
        </SettingsCard>
      </div>
    </HostModelContext>
  )
}
