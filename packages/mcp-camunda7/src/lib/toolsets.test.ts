import { afterEach, describe, expect, it, vi } from "vitest"
import type { ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import { registerEngineTools } from "../tools/engines.js"
import { registerTools } from "../tools/index.js"
import { registerIncidentIssueTools } from "../tools/incident-issue.js"
import type { EngineRegistry } from "./resolve-engine.js"
import { createInMemoryProfileStore } from "./profile-store.js"
import { withToolsetFilter } from "./toolsets.js"

type Register = Parameters<typeof registerTools>[0]
type Config = ToolConfig<EngineRegistry>

/**
 * Registers the real camunda7 tool surface against a recording registrar
 * wrapped in the toolset filter — so these assertions cover the actual tools
 * a deployment with `MCP_ACTIVE_MODULES=camunda7:<toolset>` would advertise.
 */
function toolNamesFor(toolset?: string): string[] {
  const names: string[] = []
  const recorder = Object.assign((config: Config) => names.push(config.name), {
    getRegisteredTools: () => [],
  }) as unknown as Register
  const register = withToolsetFilter(recorder, toolset)
  registerEngineTools(register, createInMemoryProfileStore())
  registerTools(register)
  registerIncidentIssueTools(register, {})
  return names.sort()
}

const DESTRUCTIVE_OR_ADMIN = [
  "camunda7_delete_process_instance",
  "camunda7_modify_process_instance",
  "camunda7_set_process_instance_suspension",
  "camunda7_create_deployment",
  "camunda7_create_migration_plan",
  "camunda7_migrate_process_instances_async",
  "camunda7_set_job_retries_batch",
]

const ENGINE_WRITES = [
  "camunda7_start_process_instance",
  "camunda7_complete_task",
  "camunda7_claim_task",
  "camunda7_set_process_instance_variable",
  "camunda7_set_job_retries",
  "camunda7_correlate_message",
  "camunda7_throw_signal",
]

describe("withToolsetFilter over the real camunda7 tool surface", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("read-only advertises no destructive or engine-write tools", () => {
    const names = toolNamesFor("read-only")
    for (const tool of [...DESTRUCTIVE_OR_ADMIN, ...ENGINE_WRITES]) {
      expect(names, `${tool} must not be in read-only`).not.toContain(tool)
    }
  })

  it("read-only keeps queries and the session-infrastructure engine tool", () => {
    const names = toolNamesFor("read-only")
    expect(names).toEqual(
      expect.arrayContaining([
        "camunda7_engine",
        "camunda7_list_process_instances",
        "camunda7_get_process_instance",
        "camunda7_query_historic_process_instances",
        "camunda7_list_incidents",
        "camunda7_get_task_form",
        "camunda7_format_incident_issue",
      ]),
    )
  })

  it("operations adds engine writes but still hides the admin-only tools", () => {
    const names = toolNamesFor("operations")
    expect(names).toEqual(expect.arrayContaining(ENGINE_WRITES))
    for (const tool of DESTRUCTIVE_OR_ADMIN) {
      expect(names, `${tool} must not be in operations`).not.toContain(tool)
    }
  })

  it("admin and the unset default both expose the full surface", () => {
    const all = toolNamesFor(undefined)
    expect(toolNamesFor("admin")).toEqual(all)
    expect(all).toEqual(expect.arrayContaining([...DESTRUCTIVE_OR_ADMIN, ...ENGINE_WRITES]))
  })

  it("toolsets are strictly nested: read-only ⊂ operations ⊂ admin", () => {
    const readOnly = toolNamesFor("read-only")
    const operations = toolNamesFor("operations")
    const admin = toolNamesFor("admin")
    expect(operations).toEqual(expect.arrayContaining(readOnly))
    expect(admin).toEqual(expect.arrayContaining(operations))
    expect(readOnly.length).toBeLessThan(operations.length)
    expect(operations.length).toBeLessThan(admin.length)
  })

  it("fails open on an unknown toolset: warns and exposes everything", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(toolNamesFor("does-not-exist")).toEqual(toolNamesFor(undefined))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown toolset "does-not-exist"'))
  })
})

/** The full tool surface with annotations, for structural (list-free) assertions. */
function recordedConfigs(): Config[] {
  const configs: Config[] = []
  const recorder = Object.assign((config: Config) => configs.push(config), {
    getRegisteredTools: () => [],
  }) as unknown as Register
  registerEngineTools(recorder, createInMemoryProfileStore())
  registerTools(recorder)
  registerIncidentIssueTools(recorder, {})
  return configs
}

/**
 * Structural guards: unlike the hand-maintained lists above, these derive the
 * expectation from each tool's OWN annotations — a future tool that forgets
 * its ADMIN_ONLY_TOOLS entry or mis-declares readOnlyHint fails here without
 * anyone updating a test list.
 */
describe("toolset rule holds structurally for every registered tool", () => {
  it("every destructiveHint tool is kept out of operations (i.e. is admin-only)", () => {
    const operations = new Set(toolNamesFor("operations"))
    const destructive = recordedConfigs().filter((c) => c.annotations?.destructiveHint === true)
    // Sanity: the surface does carry destructive tools — otherwise this test is vacuous.
    expect(destructive.length).toBeGreaterThanOrEqual(4)
    for (const config of destructive) {
      expect(
        operations.has(config.name),
        `${config.name} carries destructiveHint but is advertised in operations — add it to ADMIN_ONLY_TOOLS`,
      ).toBe(false)
    }
  })

  it("read-only advertises only readOnlyHint tools (plus session infrastructure)", () => {
    const byName = new Map(recordedConfigs().map((c) => [c.name, c]))
    for (const name of toolNamesFor("read-only")) {
      const config = byName.get(name)
      const allowed = config?.annotations?.readOnlyHint === true || name === "camunda7_engine"
      expect(
        allowed,
        `${name} is advertised in read-only but does not declare readOnlyHint: true`,
      ).toBe(true)
    }
  })
})
