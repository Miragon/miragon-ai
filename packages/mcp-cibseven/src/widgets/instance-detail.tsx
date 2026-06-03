import { useMemo, useState } from "react"
import {
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  Button,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"

import type { InstanceDetailData, OpenUserTask } from "@miragon-ai/client-cibseven"
import { BpmnDiagram, type BpmnHighlight } from "./bpmn-diagram.js"
import { ActivityNode, Section, VariablesTable } from "./instance-sections.js"
import { TaskCompleteForm } from "./task-complete-form.js"

export type { InstanceDetailData }

function OpenTaskCard({
  task,
  expanded,
  onToggle,
  onCompleted,
}: {
  task: OpenUserTask
  expanded: boolean
  onToggle: () => void
  onCompleted: () => void
}) {
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <div className="font-medium">{task.name ?? task.taskDefinitionKey}</div>
            <div className="text-muted-foreground font-mono text-xs">
              {task.taskDefinitionKey}
              {task.assignee && <> · assignee: {task.assignee}</>}
              {!task.assignee && <> · unassigned</>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onToggle}>
            {expanded ? "Cancel" : "Complete"}
          </Button>
        </div>
        {expanded && (
          <div className="mt-3 border-t pt-3">
            <TaskCompleteForm
              taskId={task.id}
              formSchema={task.formSchema}
              onCompleted={onCompleted}
              onCancel={onToggle}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function InstanceDetailWidget({ data }: { data: InstanceDetailData | null }) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set())
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const resolveMutation = useToolMutation("camunda7_resolve_incident")

  const visibleTasks = useMemo<OpenUserTask[]>(
    () => (data?.openTasks ?? []).filter((task) => !completedTaskIds.has(task.id)),
    [data?.openTasks, completedTaskIds],
  )

  const highlights = useMemo<BpmnHighlight[]>(
    () => [
      { kind: "active", activityIds: data?.activeActivityIds ?? [] },
      { kind: "incident", activityIds: data?.incidentActivityIds ?? [] },
      {
        kind: "open-task",
        activityIds: visibleTasks.map((task) => task.taskDefinitionKey),
      },
    ],
    [data?.activeActivityIds, data?.incidentActivityIds, visibleTasks],
  )

  if (!data) {
    return (
      <div className="bg-card text-card-foreground p-6">
        <Alert>
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { instance, activityTree, variables, incidents, bpmnXml } = data

  function handleResolve(incidentId: string) {
    resolveMutation.mutate(
      { incidentId },
      { onSuccess: () => setResolvedIds((prev) => new Set(prev).add(incidentId)) },
    )
  }

  const variableEntries = Object.entries(variables)
  const activeIncidents = (incidents ?? []).filter((i) => !resolvedIds.has(i.id))

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-5 p-6">
      <div>
        <h2 className="text-xl font-semibold">Process Instance Detail</h2>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span>
            ID: <code className="font-mono">{instance.id}</code>
          </span>
          {instance.businessKey && (
            <span>
              Business Key: <code className="font-mono">{instance.businessKey}</code>
            </span>
          )}
          <Badge variant={instance.ended ? "secondary" : "default"}>
            {instance.ended ? "Ended" : "Running"}
          </Badge>
          {instance.suspended && <Badge variant="secondary">Suspended</Badge>}
        </div>
        <div className="text-muted-foreground mt-1 font-mono text-xs">
          Definition: {instance.definitionId}
        </div>
      </div>

      {incidents && incidents.length > 0 && (
        <Section title="Incidents" count={activeIncidents.length} defaultOpen>
          <div className="flex flex-col gap-2">
            {incidents.map((inc) => {
              const resolved = resolvedIds.has(inc.id)
              return (
                <Card
                  key={inc.id}
                  className={`border-destructive/30 gap-0 py-0 shadow-none ${resolved ? "opacity-50" : ""}`}
                >
                  <CardContent className="p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={resolved ? "secondary" : "destructive"}>
                          {resolved ? "Resolved" : inc.incidentType}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {new Date(inc.incidentTimestamp).toLocaleString()}
                        </span>
                      </div>
                      {!resolved && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolveMutation.isPending}
                          onClick={() => handleResolve(inc.id)}
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                    {inc.incidentMessage && (
                      <p className="text-muted-foreground break-words font-mono text-sm">
                        {inc.incidentMessage}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </Section>
      )}

      {bpmnXml && (
        <Section title="Process Diagram" defaultOpen>
          <BpmnDiagram bpmnXml={bpmnXml} height={420} highlights={highlights} />
        </Section>
      )}

      {(visibleTasks.length > 0 || (data.openTasks ?? []).length > 0) && (
        <Section
          title="Open User Tasks"
          count={visibleTasks.length}
          defaultOpen={visibleTasks.length > 0}
        >
          {visibleTasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">All tasks completed.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {visibleTasks.map((task) => (
                <OpenTaskCard
                  key={task.id}
                  task={task}
                  expanded={activeTaskId === task.id}
                  onToggle={() => setActiveTaskId(activeTaskId === task.id ? null : task.id)}
                  onCompleted={() => {
                    setCompletedTaskIds((prev) => new Set(prev).add(task.id))
                    setActiveTaskId(null)
                  }}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      {activityTree && (
        <Section title="Activity Tree" defaultOpen>
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="p-3">
              <ActivityNode node={activityTree} />
            </CardContent>
          </Card>
        </Section>
      )}

      <Section title="Variables" count={variableEntries.length} defaultOpen>
        <VariablesTable variables={variables} instanceId={instance.id} readOnly={instance.ended} />
      </Section>
    </div>
  )
}
