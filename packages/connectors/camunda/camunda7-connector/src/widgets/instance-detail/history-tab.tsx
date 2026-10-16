import { HandOffButton } from "@miragon/pulse-widget-shell/widgets"
import { PagedHistoryView } from "../history-timeline.js"
import { useHandOff, type HandOff } from "../lib/hand-off.js"

/** Walk ONE instance's activity history: where the token spent its time. */
export function explainTimelineHandOff(
  instanceId: string,
  definitionId: string,
  engineId: string | undefined,
): HandOff {
  return {
    intent: "askAi.instance.explainTimeline",
    ids: { engine: engineId, processInstanceId: instanceId, processDefinitionId: definitionId },
    tools: ["camunda7_query_historic_activity_instances"],
  }
}

/** The "History" tab body — AI timeline handoff plus the paged activity history. */
export function HistoryTab({
  instanceId,
  definitionId,
  definitionKey,
  engineId,
  incidentActivityIds,
}: {
  instanceId: string
  definitionId: string
  /** The key the definition id names (null for a bare id) — the rows' analytics hand-offs. */
  definitionKey: string | null
  engineId?: string
  /** The instance's activities with an open incident — the timeline marks them. */
  incidentActivityIds: readonly string[]
}) {
  const { ask } = useHandOff()
  return (
    <>
      <div className="mb-2">
        <HandOffButton
          action="explainTimeline"
          prompt={ask(explainTimelineHandOff(instanceId, definitionId, engineId))}
        />
      </div>
      {/* Mounted on first tab activation — the lazy-load point. */}
      <PagedHistoryView
        processInstanceId={instanceId}
        processDefinitionKey={definitionKey}
        engine={engineId}
        incidentActivityIds={incidentActivityIds}
      />
    </>
  )
}
