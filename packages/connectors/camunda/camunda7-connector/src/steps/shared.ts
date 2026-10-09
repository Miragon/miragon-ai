import type { OptionalKeyDeclaration, PipelineContext } from "@miragon/mcp-toolkit-core"
import { resolveStepEngine, type Camunda7StepAppConfig } from "../lib/resolve-engine.js"

/**
 * Every camunda7 step is a THIN ADAPTER over the builder its show tool uses
 * (CLAUDE.md invariant 7) — same reads, same numbers, `engineId` stamped —
 * and fails like it: a builder error propagates out of `execute`, so a step
 * never returns a success-shaped empty payload. `steps.test.ts` holds every
 * step to its twin's output.
 */

/** The engine selector every step reads — declared so render-view can discover it. */
export const ENGINE_KEY: OptionalKeyDeclaration = {
  key: "camunda7:engine",
  description:
    "Engine id to read from (one of camunda7_list_engines). Omitted → the caller's saved default engine, or the only configured engine; required when several are configured and none is saved.",
}

/** Resolves the engine a step reads from (its `camunda7:engine` key, else the default). */
export function stepEngine(context: PipelineContext, appConfig: Camunda7StepAppConfig) {
  return resolveStepEngine(appConfig, context.keys["camunda7:engine"] as string | undefined)
}

/** A string key of the step context; undefined when absent or empty. */
export function stringKey(context: PipelineContext, key: string): string | undefined {
  const value = context.keys[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/** A required string key — `requires` gates the step, this keeps the type honest. */
export function requiredKey(context: PipelineContext, key: string): string {
  const value = stringKey(context, key)
  if (value === undefined) throw new Error(`Missing required view key \`${key}\`.`)
  return value
}
