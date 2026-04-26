import type { Client, TaskFormField, TaskFormSchema } from "@miragon-ai/client-cibseven"
import { getTaskFormInput } from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getTask,
  getFormVariables,
  getTaskVariables,
  getProcessDefinitionBpmn20Xml,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"
import { inferTaskFormFieldsFromBpmn } from "../lib/bpmn-task-form.js"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export function registerTaskFormTools(register: Register) {
  register({
    name: "camunda7_get_task_form",
    description:
      "Derive a form schema for a user task. Combines Camunda form fields (when defined) with variables inferred from outgoing gateway conditions, plus the current task variables. Used by the support UI to render task-completion forms without hardcoded knowledge.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: getTaskFormInput.shape,
    handler: async (client, args): Promise<TaskFormSchema> =>
      buildTaskFormSchema(client, args.taskId),
  })
}

export async function buildTaskFormSchema(client: Client, taskId: string): Promise<TaskFormSchema> {
  const task = (await getTask({ client, path: { id: taskId } })) as unknown as {
    id: string
    taskDefinitionKey?: string
    processDefinitionId?: string
  } | null

  const taskDefinitionKey = task?.taskDefinitionKey ?? null
  const processDefinitionId = task?.processDefinitionId ?? null

  const [formVarsResult, currentVarsResult, bpmnResult] = await Promise.all([
    getFormVariables({ client, path: { id: taskId } }).catch(() => null),
    getTaskVariables({ client, path: { id: taskId } }).catch(() => ({})),
    processDefinitionId
      ? getProcessDefinitionBpmn20Xml({ client, path: { id: processDefinitionId } }).catch(
          () => null,
        )
      : Promise.resolve(null),
  ])

  const formVars = (formVarsResult ?? {}) as Record<
    string,
    { value?: unknown; type?: string; valueInfo?: Record<string, unknown> }
  >
  const currentVariables = (currentVarsResult ?? {}) as Record<
    string,
    { value: unknown; type?: string }
  >
  const bpmnXml = (bpmnResult as { bpmn20Xml?: string } | null)?.bpmn20Xml ?? null

  const fields: TaskFormField[] = []
  const seen = new Set<string>()

  for (const [name, info] of Object.entries(formVars)) {
    if (seen.has(name)) continue
    fields.push({
      name,
      type: info.type,
      defaultValue: info.value,
      source: "form-data",
    })
    seen.add(name)
  }

  if (bpmnXml && taskDefinitionKey) {
    for (const inferred of inferTaskFormFieldsFromBpmn(bpmnXml, taskDefinitionKey)) {
      if (seen.has(inferred.name)) continue
      fields.push(inferred)
      seen.add(inferred.name)
    }
  }

  return { taskId, fields, currentVariables }
}
