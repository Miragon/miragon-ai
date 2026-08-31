import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import { WidgetRenderer, type WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import {
  AskAiButton,
  CountPill,
  SectionHeading,
  TONE_DOT,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "../../view-models.js"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA } from "../../tool-names.js"
import { formatEnginesByEnvironment, groupEnginesByEnvironment } from "../../lib/environments.js"
import { severityTone } from "../cockpit-dashboard/lib.js"
import { useT } from "../../messages/use-t.js"
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
          <CountPill tone={incidents > 0 ? "critical" : "success"}>{incidents}</CountPill>
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
 * One health tile per engine. Self-fetches the same `camunda7_cockpit_overview_data`
 * feed the per-engine cockpit overview uses, under the SAME query key — so once an
 * operator drills into an engine its overview is already warm in the cache. Clicking
 * the tile enters that engine's cockpit.
 */
function FleetEngineCard({ engineId, onEnter }: { engineId: string; onEnter: () => void }) {
  const q = useToolQuery<CockpitDashboardData>(
    ["camunda7:cockpit-overview", engineId],
    CAMUNDA7_COCKPIT_OVERVIEW_DATA,
    { engine: engineId },
  )
  const t = useT()
  const s = q.data?.summary
  const incidents = s?.totalIncidents ?? 0
  const failed = s?.totalFailedJobs ?? 0
  // Same severity ladder as the per-definition rows — including the neutral
  // tone for an idle engine (0 running instances), which must not read as green.
  const tone: ToneVariant = severityTone(failed, incidents, s?.totalRunningInstances ?? 0)

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
        <span className="text-critical text-xs">{q.error?.message ?? t("fleet.failedToLoad")}</span>
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
 * import — `filterLayoutToWidgets` drops the cell when the analytics module is
 * inactive, so the section disappears instead of erroring.
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
  const ids = engines.map((e) => e.id)
  const idArray = ids.map((id) => `"${id}"`).join(", ")
  // Health tiles group by environment (single default group renders flat) —
  // the fleet itself stays ALL engines: the landscape and the fleet-wide
  // analyses deliberately span every environment.
  const engineGroups = groupEnginesByEnvironment(engines)
  // The AI prompts see the fleet only through this string — name each engine's
  // environment when more than one exists, matching the grouping on screen.
  const idList = formatEnginesByEnvironment(engineGroups)

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
        <AskAiButton
          variant="primary"
          prompt={`Give me a cross-engine overview of the CIB Seven fleet (engines ${idList}). Start with analytics_engine_landscape({engine: [${idArray}]}) for the landscape: which process definitions run on which engine, the absolute load per engine (running instances, open incidents, failed jobs) and the engine-owned job backlog. Then call analytics_engine_health per engine for the live ops snapshot. Important: do NOT rank the engines by failure rate, incident rate or duration — the engines run different processes, so those aggregates describe each engine's process mix rather than the engine itself. Judge engines against each other only on the process-independent signals (executable/suspended job backlog, open external tasks, whether an engine reports metrics at all) and on absolute counts of trouble. Tell me: where the most work and the most trouble physically sit, whether any engine has a job backlog the others don't, whether any engine is silent, and where to start. If the landscape reports sharedProcessKeys (a definition deployed on several engines), that is the ONE place a like-for-like KPI comparison holds — use analytics_engine_compare with that processDefinitionKey. Recommend only — do not mutate anything.`}
        />
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
            prompt={`Analyze failures across the entire CIB Seven fleet (engines ${idList}). Use analytics_show_failure_dashboard({engine: [${idArray}]}) to group incidents fleet-wide by error pattern, activity and process definition. Tell me the dominant cross-engine failure cluster, whether it is isolated to one engine or systemic across the fleet, and the highest-leverage remediation. Attribute a cluster to an engine only when the same process definition also runs elsewhere without it — otherwise the difference is the process, not the engine.`}
          />
          <AskAiButton
            variant="subtle"
            label={t("fleet.performance")}
            prompt={`Give me a fleet-wide process-performance overview across CIB Seven engines ${idList}. Use analytics_show_dashboard({engine: [${idArray}], period: "7d"}) for the aggregate throughput / duration / incident picture, then call out the worst-performing process definitions across the fleet and the main bottleneck. Rank PROCESSES, not engines — a per-engine average over a different set of processes is not a statement about the engine.`}
          />
        </div>
      </section>
    </div>
  )
}
