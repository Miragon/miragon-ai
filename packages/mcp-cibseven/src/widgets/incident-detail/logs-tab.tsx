import { Alert, AlertDescription, AlertTitle, Badge } from "@miragon/mcp-toolkit-ui"

/**
 * Logs tab: OTEL traces for a process instance now live in Jaeger (the engine
 * emits them via the OTEL event-bridge → Collector → Jaeger). There is no
 * inline span store to query anymore, so we point the user at Jaeger and show
 * the attribute to filter by.
 */
export function LogsTab({ processInstanceId }: { processInstanceId: string }) {
  return (
    <Alert>
      <AlertTitle>OTEL traces are in Jaeger</AlertTitle>
      <AlertDescription>
        <div className="space-y-2 text-sm">
          <p>
            Execution spans for this process instance are exported to Jaeger. Open the Jaeger UI and
            filter by the tag:
          </p>
          <Badge variant="secondary" className="font-mono">
            camunda.process.instance.id = {processInstanceId}
          </Badge>
        </div>
      </AlertDescription>
    </Alert>
  )
}
