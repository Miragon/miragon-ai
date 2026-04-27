import type { Client } from "@miragon-ai/client-cibseven"
import { formatIncidentIssueInput } from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getIncident,
  getProcessDefinition,
  getProcessInstance,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"
import type {
  IncidentDto,
  ProcessDefinitionDto,
  ProcessInstanceDto,
} from "@miragon-ai/client-cibseven/generated/types.gen"
import type { MCPServer } from "mcp-use/server"
import { z } from "zod"

type Register = ReturnType<typeof createToolRegistrar<Client>>

export interface IncidentIssueConfig {
  /** `owner/repo` of the GitHub repository where incidents should be filed. */
  repository?: string
  /** Cockpit base URL for jump-out links in the issue body. */
  cockpitUrl?: string
}

export interface IncidentIssuePayload {
  title: string
  body: string
  labels: string[]
  /** Repository in `owner/repo` form, or `null` if neither config nor override provided one. */
  suggestedRepository: string | null
  /** Tool name on the official GitHub MCP server that should consume this payload. */
  suggestedTool: "create_issue"
  nextStep: string
}

interface BuildIssueInput {
  incident: IncidentDto
  processInstance?: ProcessInstanceDto | null
  processDefinition?: ProcessDefinitionDto | null
  cockpitUrl?: string
  repository: string | null
}

const ISSUE_LABELS = ["bug", "incident"]

/**
 * Pure formatter — no I/O. Mirrors the structure of `.github/ISSUE_TEMPLATE/bug_report.yml`
 * so the resulting issue body fills the same sections a human would. Kept side-effect-free
 * so it can be unit-tested without mocking the SDK.
 */
export function buildIncidentIssuePayload(input: BuildIssueInput): IncidentIssuePayload {
  const { incident, processInstance, processDefinition, cockpitUrl, repository } = input
  const incidentType = incident.incidentType ?? "unknown"
  const definitionKey = processDefinition?.key ?? "unknown-process"
  const title = `[Bug]: Engine incident (${incidentType}) in ${definitionKey}`

  const cockpitLink = buildCockpitInstanceLink({
    cockpitUrl,
    processDefinitionKey: processDefinition?.key,
    processDefinitionVersion: processDefinition?.version,
    processInstanceId: incident.processInstanceId ?? processInstance?.id,
  })

  const body = [
    "### Description",
    "",
    `Engine incident \`${incidentType}\` was raised on activity \`${
      incident.failedActivityId ?? incident.activityId ?? "unknown"
    }\` of process \`${definitionKey}\`.`,
    "",
    incident.incidentMessage
      ? `Engine message:\n\n\`\`\`\n${incident.incidentMessage}\n\`\`\``
      : "_No incident message reported by the engine._",
    "",
    "### Steps to Reproduce",
    "",
    "1. Start an instance of the affected process definition (see below).",
    "2. Reach the failed activity with the same input variables that produced this incident.",
    "3. Observe the incident in the engine.",
    "",
    "### Expected Behaviour",
    "",
    "The activity completes without raising an incident.",
    "",
    "### Actual Behaviour",
    "",
    `An incident of type \`${incidentType}\` is raised. See engine context below.`,
    "",
    "### Engine context",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Incident ID | \`${incident.id ?? "unknown"}\` |`,
    `| Incident type | \`${incidentType}\` |`,
    `| Activity ID | \`${incident.failedActivityId ?? incident.activityId ?? "unknown"}\` |`,
    `| Process definition key | \`${definitionKey}\` |`,
    `| Process definition ID | \`${incident.processDefinitionId ?? "unknown"}\` |`,
    `| Process instance ID | \`${incident.processInstanceId ?? "unknown"}\` |`,
    `| Tenant | \`${incident.tenantId ?? "—"}\` |`,
    `| Timestamp | \`${incident.incidentTimestamp ?? "unknown"}\` |`,
    `| Root cause incident ID | \`${incident.rootCauseIncidentId ?? "—"}\` |`,
    "",
    "### Affected Module",
    "",
    "camunda7",
    "",
    "### Process Engine",
    "",
    "CIB Seven",
    "",
    cockpitLink ? `### Cockpit\n\n${cockpitLink}\n` : "",
    "_Filed via the `camunda7_format_incident_issue` MCP tool._",
  ]
    .filter((line) => line !== "")
    .join("\n")

  return {
    title,
    body,
    labels: ISSUE_LABELS,
    suggestedRepository: repository,
    suggestedTool: "create_issue",
    nextStep: repository
      ? `Pass {title, body, labels, repository: "${repository}"} to the GitHub MCP server's create_issue tool.`
      : "No repository configured. Ask the user which `owner/repo` should receive this incident, then call the GitHub MCP server's create_issue tool.",
  }
}

function buildCockpitInstanceLink(args: {
  cockpitUrl?: string
  processDefinitionKey?: string | null
  processDefinitionVersion?: number | null
  processInstanceId?: string | null
}): string | null {
  const { cockpitUrl, processDefinitionKey, processDefinitionVersion, processInstanceId } = args
  if (!cockpitUrl || !processDefinitionKey || !processInstanceId) return null
  const version = processDefinitionVersion ?? "latest"
  const base = cockpitUrl.replace(/\/+$/, "")
  return `${base}/#/seven/auth/process/${processDefinitionKey}/${version}/${processInstanceId}?tab=incidents`
}

export function registerIncidentIssueTools(register: Register, config: IncidentIssueConfig) {
  register({
    name: "camunda7_format_incident_issue",
    description:
      "Build a GitHub-issue payload (title, body, labels, repository) from a Camunda 7 / CIB Seven incident. " +
      "Does NOT create the issue — pass the returned payload to the GitHub MCP server's `create_issue` tool.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: formatIncidentIssueInput.shape,
    handler: async (client, args) => {
      // The OpenAPI SDK types describe a `{data, error}` envelope, but the
      // shared client (see `client.ts`) is built with `responseStyle: "data"`
      // + `throwOnError: true` — so at runtime the call returns the raw DTO.
      // The cast matches the convention used in `incident-panel-data.ts`.
      const incident = (await getIncident({
        client,
        path: { id: args.incidentId },
      })) as unknown as IncidentDto

      const [processInstance, processDefinition] = await Promise.all([
        incident.processInstanceId
          ? (getProcessInstance({
              client,
              path: { id: incident.processInstanceId },
            }) as unknown as Promise<ProcessInstanceDto>)
          : Promise.resolve(null),
        incident.processDefinitionId
          ? (getProcessDefinition({
              client,
              path: { id: incident.processDefinitionId },
            }) as unknown as Promise<ProcessDefinitionDto>)
          : Promise.resolve(null),
      ])

      const repository = args.repository ?? config.repository ?? null
      return buildIncidentIssuePayload({
        incident,
        processInstance,
        processDefinition,
        cockpitUrl: config.cockpitUrl,
        repository,
      })
    },
  })
}

const incidentIssuePromptSchema = z.object({
  incidentId: z.string().describe("The Camunda 7 / CIB Seven incident ID to report"),
  repository: z
    .string()
    .optional()
    .describe("Optional `owner/repo` override for the target GitHub repository"),
})

/**
 * Cross-MCP orchestration prompt: tells the host agent to chain
 * `camunda7_format_incident_issue` → official GitHub MCP server's `create_issue`.
 * We don't issue the GitHub call ourselves — auth/scope/secret-scanning are handled
 * by the user's installed GitHub MCP server.
 */
export function registerIncidentIssuePrompt(server: MCPServer, config: IncidentIssueConfig) {
  server.prompt(
    {
      name: "report_incident_to_github",
      description:
        "Report a Camunda 7 / CIB Seven engine incident as a GitHub issue. Requires the official GitHub MCP server (github/github-mcp-server) to be installed alongside this server.",
      schema: incidentIssuePromptSchema,
    },
    async ({ incidentId, repository }) => {
      const target = repository ?? config.repository
      const targetClause = target
        ? `Use repository \`${target}\` unless the user explicitly overrides it.`
        : "Ask the user which `owner/repo` should receive the issue if none is specified."
      const text = [
        `You will report Camunda 7 / CIB Seven incident \`${incidentId}\` to GitHub.`,
        "",
        "Steps:",
        `1. Call the \`camunda7_format_incident_issue\` tool with \`incidentId="${incidentId}"\`${
          repository ? ` and \`repository="${repository}"\`` : ""
        }.`,
        "2. Take the returned `{title, body, labels, suggestedRepository}` payload and call the **GitHub MCP server**'s `create_issue` tool with those exact fields. Use `suggestedRepository` (split into `owner` and `repo`) as the target.",
        `3. ${targetClause}`,
        "4. Confirm to the user with the URL of the created issue.",
        "",
        "Do NOT modify the title or body — they already match the project's bug-report template. Only set additional fields (e.g. assignees) if the user explicitly asks.",
      ].join("\n")

      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text },
          },
        ],
      }
    },
  )
}
