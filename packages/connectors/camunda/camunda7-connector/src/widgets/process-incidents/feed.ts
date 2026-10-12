import { useViewData, type ViewDataResult } from "@miragon/mcp-toolkit-ui/hooks"
import type { ProcessIncidentsData } from "../../view-models.js"
import { CAMUNDA7_PROCESS_INCIDENTS_DATA } from "../../tool-names.js"

/**
 * The ONE definition-feed query the four widgets of the definition view
 * (header, KPI strip, flow, activity list) share — one key, so they dedupe
 * to a single call and a write's refetch updates all four. In the cockpit the
 * scope comes from the props; a standalone render has none, so it comes from
 * the handed-in data's echo: the refetch reads the definition and the engine
 * the show tool answered for, never the caller's default engine. The
 * handed-in data SEEDS the feed (the toolkit's `initialDataMode: "seed"`), so a
 * write's invalidation refetches a standalone render too.
 */
export function useDefinitionData(
  initialData: ProcessIncidentsData | null,
  processDefinitionKey: string | undefined,
  engine: string | undefined,
): ViewDataResult<ProcessIncidentsData> {
  const key = processDefinitionKey ?? initialData?.processDefinitionKey
  const feedEngine = engine ?? initialData?.engineId
  return useViewData<ProcessIncidentsData>(
    initialData,
    ["camunda7:process-incidents", feedEngine ?? null, key ?? null],
    CAMUNDA7_PROCESS_INCIDENTS_DATA,
    { processDefinitionKey: key, engine: feedEngine },
    !!key,
    { initialDataMode: "seed" },
  )
}
