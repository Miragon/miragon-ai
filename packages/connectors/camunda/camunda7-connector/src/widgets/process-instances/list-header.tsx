import { AskAiButton, LivePill, WidgetHeader } from "@miragon-ai/widget-shell/widgets"
import { useT } from "../../messages/use-t.js"

export function InstancesHeader({
  title,
  scopedKey,
  total,
  resolvedEngine,
}: {
  title: string
  /** The list's definition scope — null in the engine-wide list. */
  scopedKey: string | null
  total: number
  resolvedEngine: string
}) {
  const t = useT()
  return (
    <WidgetHeader
      icon="▶"
      iconTone="info"
      title={title}
      sub={
        <>
          <LivePill tone="info">
            {t("processInstances.runningCount", { count: total.toLocaleString() })}
          </LivePill>
          {scopedKey && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-xs">{scopedKey}</span>
            </>
          )}
        </>
      }
      actions={
        <AskAiButton
          variant="primary"
          prompt={
            scopedKey
              ? `Triage the running instances of CIB Seven process "${title}" (key ${scopedKey}, engine ${resolvedEngine}). There are ${total} running instances total. Use camunda7_list_incidents (processDefinitionKey ${scopedKey}) and camunda7_query_historic_activity_instances to group the incidents by failed activity and incident type, identify the dominant failure mode, and tell me how many instances are likely fixable by a job retry vs. needing a variable change or modification. Give me a prioritized triage: which cluster to fix first and the single recommended remediation per cluster. Do not mutate anything yet — recommendations only.`
              : `Triage the running process instances on CIB Seven engine ${resolvedEngine} — ${total} across all definitions. Use camunda7_list_incidents (engine ${resolvedEngine}) to group the current failures by process definition, failed activity and incident type, identify which definitions carry the most incident-affected instances, and tell me how many are likely fixable by a job retry vs. needing a variable change or modification. Give me a prioritized triage per definition. Do not mutate anything yet — recommendations only.`
          }
        />
      }
    />
  )
}
