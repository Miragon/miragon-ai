import { AskAiButton, LivePill, WidgetHeader } from "@miragon-ai/widget-shell/widgets"
import { useHandOff, type HandOff } from "../lib/hand-off.js"
import { useT } from "../../messages/use-t.js"

/**
 * Triage of the running instances — of one definition (scoped list) or of the
 * whole engine. The process name is the deployer's text — quoted.
 */
export function triageInstancesHandOff({
  scopedKey,
  processName,
  total,
  engine,
}: {
  scopedKey: string | null
  processName: string | null
  total: number
  engine: string | undefined
}): HandOff {
  return scopedKey
    ? {
        intent: "askAi.instances.triageProcess",
        ids: { engine, processDefinitionKey: scopedKey },
        facts: { runningInstances: total },
        untrusted: [{ label: "processName", text: processName }],
        tools: [
          "camunda7_list_incidents",
          "camunda7_query_historic_incidents",
          "camunda7_query_historic_activity_instances",
        ],
      }
    : {
        intent: "askAi.instances.triageEngine",
        ids: { engine },
        facts: { runningInstances: total },
        tools: ["camunda7_list_incidents", "camunda7_query_historic_incidents"],
      }
}

export function InstancesHeader({
  title,
  processName,
  scopedKey,
  total,
  engine,
}: {
  title: string
  /** The definition's name — null when it has none (or the list is engine-wide). */
  processName: string | null
  /** The list's definition scope — null in the engine-wide list. */
  scopedKey: string | null
  total: number
  /** The engine the list was fetched from — undefined when the default routed it. */
  engine: string | undefined
}) {
  const t = useT()
  const { ask } = useHandOff()
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
          prompt={ask(triageInstancesHandOff({ scopedKey, processName, total, engine }))}
        />
      }
    />
  )
}
