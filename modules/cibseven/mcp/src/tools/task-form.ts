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

interface TaskMeta {
  taskDefinitionKey?: string | null
  processDefinitionId?: string | null
}

export interface BuildTaskFormSchemaOptions {
  /** When provided, skips the redundant `getTask` round-trip. */
  task?: TaskMeta | null
  /**
   * Pre-fetched BPMN XML for the task's process definition. Pass `null`
   * to skip the BPMN fetch entirely (no inference). Leave `undefined`
   * (default) to fetch on demand.
   */
  bpmnXml?: string | null
}

export function registerTaskFormTools(register: Register) {
  register({
    name: "camunda7_get_task_form",
    description:
      "Derive a form schema for a user task. Combines Camunda form fields (when defined) with variables inferred from outgoing gateway conditions, plus the current task variables. Used by the support UI to render task-completion forms without hardcoded knowledge.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: getTaskFormInput.shape,
    handler: async (client, args): Promise<TaskFormSchema> => {
      const { taskId } = args as { taskId: string }
      return buildTaskFormSchema(client, taskId)
    },
  })
}

export async function buildTaskFormSchema(
  client: Client,
  taskId: string,
  options: BuildTaskFormSchemaOptions = {},
): Promise<TaskFormSchema> {
  const taskMeta = options.task ?? (await fetchTaskMeta(client, taskId))
  const taskDefinitionKey = taskMeta?.taskDefinitionKey ?? null
  const processDefinitionId = taskMeta?.processDefinitionId ?? null

  const bpmnPromise =
    "bpmnXml" in options
      ? Promise.resolve(options.bpmnXml ?? null)
      : fetchBpmnXml(client, processDefinitionId)

  const [formVarsResult, currentVarsResult, bpmnXml] = await Promise.all([
    getFormVariables({ client, path: { id: taskId } }).catch(() => null),
    getTaskVariables({ client, path: { id: taskId } }).catch(() => ({})),
    bpmnPromise,
  ])

  const formVars = (formVarsResult ?? {}) as Record<
    string,
    { value?: unknown; type?: string; valueInfo?: Record<string, unknown> }
  >
  const currentVariables = (currentVarsResult ?? {}) as Record<
    string,
    { value: unknown; type?: string }
  >

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

async function fetchTaskMeta(client: Client, taskId: string): Promise<TaskMeta | null> {
  const result = (await getTask({ client, path: { id: taskId } }).catch(
    () => null,
  )) as unknown as TaskMeta | null
  return result
}

async function fetchBpmnXml(
  client: Client,
  processDefinitionId: string | null,
): Promise<string | null> {
  if (!processDefinitionId) return null
  const xmlResponse = (await getProcessDefinitionBpmn20Xml({
    client,
    path: { id: processDefinitionId },
  }).catch(() => null)) as { bpmn20Xml?: string } | null
  return xmlResponse?.bpmn20Xml ?? null
}
