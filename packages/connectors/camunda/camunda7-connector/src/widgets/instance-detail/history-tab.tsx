import { AskAiButton } from "@miragon-ai/widget-shell/widgets"

import { PagedHistoryView } from "../history-timeline.js"
import { useHandOff, type HandOff } from "../lib/hand-off.js"
import { useT } from "../../messages/use-t.js"

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
  engineId,
}: {
  instanceId: string
  definitionId: string
  engineId?: string
}) {
  const t = useT()
  const { ask } = useHandOff()
  return (
    <>
      <div className="mb-2">
        <AskAiButton
          variant="subtle"
          label={t("instanceDetail.explainTimeline")}
          prompt={ask(explainTimelineHandOff(instanceId, definitionId, engineId))}
        />
      </div>
      {/* Mounted on first tab activation — the lazy-load point. */}
      <PagedHistoryView processInstanceId={instanceId} engine={engineId} />
    </>
  )
}
