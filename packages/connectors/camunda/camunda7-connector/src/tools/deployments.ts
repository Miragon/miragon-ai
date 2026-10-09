import type { z } from "zod"
import {
  listDeploymentsInput,
  createDeploymentInput,
  getDeploymentInput,
} from "@miragon-ai/camunda7-client/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { engineSorting } from "@miragon-ai/camunda7-client"
import { getDeployments, getDeployment, createDeployment } from "@miragon-ai/camunda7-client/sdk"
import type { MultiFormDeploymentDto } from "@miragon-ai/camunda7-client/types"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

/**
 * The `POST /deployment/create` multipart body, as the generated SDK expects it.
 *
 * A PLAIN record on purpose: the SDK's `formDataBodySerializer` builds the
 * multipart body itself by walking `Object.entries(body)`, so a prebuilt
 * `FormData` (no own enumerable entries) went out as an EMPTY body and no
 * deployment ever succeeded (#326). Here every resource is a `File`, which the
 * serializer appends under its own name as the part's filename — the engine
 * names each deployed resource after that filename. Undefined fields are
 * skipped and booleans go out as "true"/"false"; empty strings are dropped like
 * absent ones so an empty `tenant-id` never reaches the engine.
 *
 * Part NAMES are synthetic (`resource-<n>`): the engine collects the parts in a
 * map keyed by name and treats its reserved names (`deployment-name`,
 * `tenant-id`, …) as fields, so naming a part after its resource would let a
 * resource called e.g. "tenant-id" hijack a field instead of being deployed.
 */
type DeploymentForm = MultiFormDeploymentDto & Record<`resource-${number}`, File>

function deploymentForm(args: z.infer<typeof createDeploymentInput>): DeploymentForm {
  const form: DeploymentForm = {
    "deployment-name": args.deploymentName,
    "enable-duplicate-filtering": args.enableDuplicateFiltering,
    "deploy-changed-only": args.deployChangedOnly,
    "deployment-source": args.deploymentSource || undefined,
    "tenant-id": args.tenantId || undefined,
  }
  args.resources.forEach((resource, index) => {
    form[`resource-${index}`] = new File([resource.content], resource.name)
  })
  return form
}

export function registerDeploymentTools(
  register: Register,
  { allowDeployments }: { allowDeployments: boolean },
) {
  register({
    name: "camunda7_get_deployment",
    category: "deployments",
    description:
      "Get a deployment by ID — returns deployment timestamp + source, used for pre/post deployment correlation (commit-hash → deployment-ID → timestamp).",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...getDeploymentInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) => getDeployment({ client, path: { id: args.id } })),
  })

  register({
    name: "camunda7_list_deployments",
    category: "deployments",
    description: "List deployments with optional filters.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...listDeploymentsInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
      getDeployments({
        client,
        query: {
          name: args.name,
          nameLike: args.nameLike,
          maxResults: args.maxResults,
          ...engineSorting(args),
        },
      }),
    ),
  })

  // Deploying IS code execution inside the engine JVM — a deployed model's
  // expressions (JUEL method calls suffice, no script engine needed), scripts
  // and listener/delegate references run with the engine's privileges. So the
  // tool is opt-in (CAMUNDA_ALLOW_DEPLOYMENTS=true) ON TOP of admin-only
  // (ADMIN_ONLY_TOOLS): without the flag it is not registered in any toolset.
  if (!allowDeployments) return

  register({
    name: "camunda7_create_deployment",
    category: "deployments",
    description:
      "Deploy BPMN process definitions and other resources to the engine. Supports duplicate filtering and deploy-changed-only. " +
      "WARNING: deploying runs code inside the engine JVM — expressions, scripts and listener/delegate references in the " +
      "deployed models execute with the engine's privileges. Available only in the admin toolset with CAMUNDA_ALLOW_DEPLOYMENTS=true.",
    annotations: { destructiveHint: true, openWorldHint: true },
    inputSchema: { ...createDeploymentInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args) =>
      createDeployment({ client, body: deploymentForm(args) }),
    ),
  })
}
