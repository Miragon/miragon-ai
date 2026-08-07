import { AskAiButton } from "@miragon-ai/widget-shell/widgets"

import { PagedHistoryView } from "../history-timeline.js"
import { useT } from "../../messages/use-t.js"

/** The "History" tab body — AI timeline handoff plus the paged activity history. */
export function HistoryTab({
  instanceId,
  definitionId,
  engineId,
  engineClause,
}: {
  instanceId: string
  definitionId: string
  engineId?: string
  engineClause: string
}) {
  const t = useT()
  return (
    <>
      <div className="mb-2">
        <AskAiButton
          variant="subtle"
          label={t("instanceDetail.explainTimeline")}
          prompt={`Explain the execution timeline of CIB Seven process instance ${instanceId} (definition ${definitionId}${engineClause}). Use camunda7_query_historic_activity_instances(processInstanceId: "${instanceId}") to walk the per-activity history in order: where did the token spend the most time, which step is it currently stuck at, and does the path taken match the expected happy path? Call out the single biggest delay and whether it indicates a problem. Explanation only — do not change anything.`}
        />
      </div>
      {/* Mounted on first tab activation — the lazy-load point. */}
      <PagedHistoryView processInstanceId={instanceId} engine={engineId} />
    </>
  )
}
