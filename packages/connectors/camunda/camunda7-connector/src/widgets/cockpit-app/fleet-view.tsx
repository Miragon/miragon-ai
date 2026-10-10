import { WidgetRenderer, type WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { AskAiButton, CountPill, SectionHeading, TONE_DOT } from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "../../view-models.js"
import {
  enginesByEnvironment,
  formatEnginesByEnvironment,
  groupEnginesByEnvironment,
} from "../../lib/environments.js"
import { useT } from "../../messages/use-t.js"
import { useHandOff, type HandOff } from "../lib/hand-off.js"
import { useEngineHealth } from "./engine-health.js"
import { filterLayoutToWidgets } from "./views.js"

function FleetEngineKpis({
  summary,
  incidents,
  failed,
}: {
  summary: NonNullable<CockpitDashboardData["summary"]>
  incidents: number
  failed: number
}) {
  const t = useT()
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div>
        <div className="text-muted-foreground text-[11px]">{t("fleet.running")}</div>
        <div className="text-foreground font-mono font-semibold tabular-nums">
          {summary.totalRunningInstances.toLocaleString()}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground text-[11px]">{t("fleet.incidents")}</div>
        <div>
          <CountPill tone={incidents > 0 ? "danger" : "success"}>{incidents}</CountPill>
        </div>
      </div>
      <div>
        <div className="text-muted-foreground text-[11px]">{t("fleet.failedJobs")}</div>
        <div>
          {failed > 0 ? (
            <CountPill tone="warning">{failed}</CountPill>
          ) : (
            <span className="text-muted-foreground font-mono text-xs">0</span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * One health tile per engine ({@link useEngineHealth} — the same numbers the
 * landing's engine picker shows). Clicking the tile enters that engine's cockpit.
 */
function FleetEngineCard({ engineId, onEnter }: { engineId: string; onEnter: () => void }) {
  const { query: q, summary: s, incidents, failed, tone } = useEngineHealth(engineId)
  const t = useT()

  return (
    <button
      type="button"
      onClick={onEnter}
      // No aria-label: it would REPLACE the accessible name and hide the KPI
      // grid + error text from screen readers — the visible content (engine
      // name, "Operate", counts) speaks for itself.
      className="border-border bg-card hover:bg-muted focus-visible:ring-ring flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-foreground inline-flex items-center gap-2 font-semibold">
          <span className={`size-2 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
          {engineId}
        </span>
        <span className="text-muted-foreground text-xs">
          {t("fleet.operate")} <span aria-hidden>→</span>
        </span>
      </div>

      {q.isError ? (
        <span className="text-danger-ink text-xs">
          {q.error?.message ?? t("fleet.failedToLoad")}
        </span>
      ) : !s ? (
        <span className="text-muted-foreground text-xs">{t("fleet.loading")}</span>
      ) : (
        <FleetEngineKpis summary={s} incidents={incidents} failed={failed} />
      )}
      {s && (
        <div className="text-muted-foreground text-[11px]">
          {s.totalDefinitions === 1
            ? t("fleet.processDefinitionsOne", { count: s.totalDefinitions })
            : t("fleet.processDefinitionsOther", { count: s.totalDefinitions })}
        </div>
      )}
    </button>
  )
}

/** Widget id of the analytics module's cross-engine landscape (tier-2 raw reference). */
const LANDSCAPE_WIDGET = "analytics:engine-landscape"

/**
 * The analytics module's cross-engine landscape, composed by raw widget id.
 * Tier-2 cross-module UI (architecture invariant 8): the id is a string, not an
 * import — `filterLayoutToWidgets` drops the cell when the analytics widgets are
 * not bundled. A bundled but runtime-INACTIVE analytics module never gets here:
 * the cockpit only offers the fleet view once `useAnalyticsActive` confirms it.
 */
function LandscapeSection({
  engineIds,
  widgets,
}: {
  engineIds: string[]
  widgets: Record<string, WidgetComponent>
}) {
  const t = useT()
  const layout = filterLayoutToWidgets(
    // The FULL engine list travels as a prop so an engine that reports no
    // metrics at all still shows up in the landscape instead of silently
    // dropping out of the overview.
    [{ row: [{ widget: LANDSCAPE_WIDGET, props: { engine: engineIds } }] }],
    widgets,
  )
  if (!(LANDSCAPE_WIDGET in widgets)) return null
  return (
    <section>
      <SectionHeading title={t("fleet.landscape.title")} hint={t("fleet.landscape.hint")} />
      <WidgetRenderer layout={layout} keys={{}} errors={[]} widgets={widgets} />
    </section>
  )
}

/** The fleet the hand-offs are about: every engine id, plus `environment/engine` pairs when grouped. */
interface Fleet {
  engineIds: string[]
  environments: string[] | undefined
}

/**
 * The cross-engine overview. The "never rank engines by a rate" rule is the
 * analytics module's server instruction — the prompt only names the fleet.
 */
export function fleetOverviewHandOff({ engineIds, environments }: Fleet): HandOff {
  return {
    intent: "askAi.fleet.overview",
    ids: { engine: engineIds },
    facts: { environments },
    tools: ["analytics_engine_landscape", "analytics_engine_health", "analytics_engine_compare"],
  }
}

export function fleetFailuresHandOff({ engineIds, environments }: Fleet): HandOff {
  return {
    intent: "askAi.fleet.failures",
    ids: { engine: engineIds },
    facts: { environments },
    tools: ["analytics_show_failure_dashboard"],
  }
}

export function fleetPerformanceHandOff({ engineIds, environments }: Fleet): HandOff {
  return {
    intent: "askAi.fleet.performance",
    ids: { engine: engineIds, period: "7d" },
    facts: { environments },
    tools: ["analytics_show_dashboard"],
  }
}

/**
 * The cross-engine ("fleet") cockpit mode — an OVERVIEW across all configured
 * engines, not a scoreboard between them. Engines host different processes, so
 * ranking them by failure rate or duration would rank their process mixes; the
 * landscape section therefore shows what runs where plus absolute load and the
 * process-independent job backlog, and offers the KPI comparison only for the
 * definitions that actually run on more than one engine.
 *
 * Composed from a self-fetched health tile per engine (drill in to operate it),
 * the analytics landscape widget, and the fleet-wide AI analyses the
 * single-engine cockpit can't answer.
 */
export function FleetView({
  engines,
  onEnterEngine,
  widgets,
}: {
  engines: Array<{ id: string; environment?: string }>
  onEnterEngine: (id: string) => void
  /** Host widget registry — resolves the analytics landscape section (tier-2). */
  widgets: Record<string, WidgetComponent>
}) {
  const t = useT()
  const { ask } = useHandOff()
  const ids = engines.map((e) => e.id)
  // Health tiles group by environment (single default group renders flat) —
  // the fleet itself stays ALL engines: the landscape and the fleet-wide
  // analyses deliberately span every environment.
  const engineGroups = groupEnginesByEnvironment(engines)
  const idList = formatEnginesByEnvironment(engineGroups)
  // The hand-offs name each engine's environment only when more than one
  // exists, matching the grouping on screen.
  const fleet: Fleet = { engineIds: ids, environments: enginesByEnvironment(engineGroups) }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="bg-m-blue-soft text-m-blue mb-3 grid size-11 place-items-center rounded-xl text-xl">
            ⤧
          </div>
          <h1 className="text-foreground mb-1.5 text-2xl font-bold tracking-tight">
            {t("fleet.heading")}
          </h1>
          <div className="text-muted-foreground text-sm">
            {engines.length === 1
              ? t("fleet.engineCountOne", { count: engines.length, list: idList })
              : t("fleet.engineCountOther", { count: engines.length, list: idList })}
          </div>
        </div>
        <AskAiButton variant="primary" prompt={ask(fleetOverviewHandOff(fleet))} />
      </header>

      <section className="flex flex-col gap-4">
        <SectionHeading title={t("fleet.engineHealth.title")} hint={t("fleet.engineHealth.hint")} />
        {engineGroups.map((g) => (
          <div key={g.id}>
            {engineGroups.length > 1 && (
              <div className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                {g.id}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.engines.map((e) => (
                <FleetEngineCard key={e.id} engineId={e.id} onEnter={() => onEnterEngine(e.id)} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <LandscapeSection engineIds={ids} widgets={widgets} />

      <section>
        <SectionHeading
          title={t("fleet.fleetAnalyses.title")}
          hint={t("fleet.fleetAnalyses.hint")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <AskAiButton
            variant="subtle"
            label={t("fleet.failureAnalysis")}
            prompt={ask(fleetFailuresHandOff(fleet))}
          />
          <AskAiButton
            variant="subtle"
            label={t("fleet.performance")}
            prompt={ask(fleetPerformanceHandOff(fleet))}
          />
        </div>
      </section>
    </div>
  )
}
