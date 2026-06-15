import { z } from "zod"
import type { Client } from "@miragon-ai/client-cibseven"
import { resolveEngine, type EngineRegistry } from "./resolve-engine.js"

/**
 * Optional `engine` parameter spread into every operations tool's input
 * schema. When set it overrides the session's sticky selection for that one
 * call; when omitted, [[resolveEngine]] falls back to the sticky pick.
 */
export const engineParamShape = {
  engine: z
    .string()
    .optional()
    .describe(
      'Optional engine id override for this single call. When omitted, the engine selected via `camunda7_engine` (action "select") for this session is used; when only one engine is configured, that one is used.',
    ),
}

export interface EngineContext {
  engineId: string
  cockpitUrl?: string
}

/**
 * Lifts a handler written against a single `Client` into a handler that
 * resolves the engine from the registry (override > sticky > single-default)
 * before delegating. Keeps individual tool files small — the only diff is the
 * `withEngine(...)` wrap and adding `...engineParamShape` to `inputSchema`.
 */
export function withEngine<TArgs extends { engine?: string }, TResult>(
  fn: (client: Client, args: TArgs, ctx: EngineContext) => Promise<TResult>,
): (registry: EngineRegistry, args: TArgs) => Promise<TResult> {
  return async (registry, args) => {
    const { client, engineId, cockpitUrl } = resolveEngine(args.engine, registry)
    return fn(client, args, { engineId, cockpitUrl })
  }
}
