import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  CountPill,
  SectionHeading,
  TONE_DOT,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "../../view-models.js"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA } from "../../tool-names.js"
import { useT } from "../../messages/use-t.js"

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
  const tone: ToneVariant = incidents > 0 ? "critical" : failed > 0 ? "warning" : "success"

  return (
    <button
      type="button"
      onClick={onEnter}
      aria-label={t("fleet.operateEngineAria", { name: engineId })}
      className="border-border bg-card hover:bg-muted focus-visible:ring-ring flex flex-col gap-3 rounded-xl border p-4 text-left outline-none transition-colors focus-visible:ring-2"
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
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-muted-foreground text-[11px]">{t("fleet.running")}</div>
            <div className="text-foreground font-mono font-semibold tabular-nums">
              {s.totalRunningInstances.toLocaleString()}
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

/**
 * The cross-engine ("fleet") cockpit mode. A landscape view ACROSS all configured
 * engines: a self-fetched health tile per engine (drill in to operate it) plus the
 * cross-engine AI analyses (compare engines, fleet-wide failures/performance) that
 * the single-engine cockpit can't answer. The deep comparisons are agentic handoffs
 * — they run the analytics `*_compare` / `show_*` tools, which aggregate over the
 * whole fleet via an engineId array.
 */
export function FleetView({
  engines,
  onEnterEngine,
}: {
  engines: Array<{ id: string }>
  onEnterEngine: (id: string) => void
}) {
  const t = useT()
  const ids = engines.map((e) => e.id)
  const idList = ids.join(", ")
  const idArray = ids.map((id) => `"${id}"`).join(", ")
  const [a, b] = ids

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
          prompt={`Triage the whole CIB Seven fleet across engines ${idList}. For each engine call analytics_engine_health (engineId per engine) for the live ops snapshot, and use analytics_engine_compare to rank the engines against each other. Identify which engine is in the worst shape and why (running WIP, open incidents, dead jobs, failure/incident rate), name the single most urgent cross-engine problem, and tell me where to start. Then give a one-line health verdict per engine. Recommend only — do not mutate anything.`}
        />
      </header>

      <section>
        <SectionHeading title={t("fleet.engineHealth.title")} hint={t("fleet.engineHealth.hint")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {engines.map((e) => (
            <FleetEngineCard key={e.id} engineId={e.id} onEnter={() => onEnterEngine(e.id)} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          title={t("fleet.fleetAnalyses.title")}
          hint={t("fleet.fleetAnalyses.hint")}
        />
        <div className="flex flex-wrap items-center gap-2">
          {a && b && (
            <AskAiButton
              variant="subtle"
              label={t("fleet.compareEngines")}
              prompt={`Compare the CIB Seven engines ${a} vs ${b} over the last 7 days. Use analytics_show_engine_compare({engineA: "${a}", engineB: "${b}", windowDays: 7}) to render the side-by-side KPIs, then interpret the deltas (failure rate, incident rate, avg/p95 duration): which engine is healthier and by how much, whether the gap is significant (watch the 'suppressed' low-sample flag), and the single recommended action.${ids.length > 2 ? ` Note: ${ids.length} engines are configured (${idList}); after this pair, compare the remaining engines too.` : ""}`}
            />
          )}
          <AskAiButton
            variant="subtle"
            label={t("fleet.failureAnalysis")}
            prompt={`Analyze failures across the entire CIB Seven fleet (engines ${idList}). Use analytics_show_failure_dashboard({engineId: [${idArray}]}) to group incidents fleet-wide by error pattern, activity and process definition. Tell me the dominant cross-engine failure cluster, whether it is isolated to one engine or systemic across the fleet, and the highest-leverage remediation.`}
          />
          <AskAiButton
            variant="subtle"
            label={t("fleet.performance")}
            prompt={`Give me a fleet-wide process-performance overview across CIB Seven engines ${idList}. Use analytics_show_dashboard({engineId: [${idArray}], period: "7d"}) for the aggregate throughput / duration / incident picture, then call out the worst-performing process definitions across the fleet and the main bottleneck.`}
          />
        </div>
      </section>
    </div>
  )
}
