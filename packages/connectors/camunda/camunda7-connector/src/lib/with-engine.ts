import { z } from "zod"
import type { Client } from "@miragon-ai/camunda7-client"
import type { EngineProvider } from "../engine-provider.js"
import { resolveEngine, type EngineCallContext, type EngineRegistry } from "./resolve-engine.js"

/**
 * Optional `engine` parameter spread into every operations tool's input
 * schema. When set it overrides the caller's saved default engine for that one
 * call; when omitted, [[resolveEngine]] falls back to the saved default.
 */
export const engineParamShape = {
  engine: z
    .string()
    .optional()
    .describe(
      "Optional engine id override for this single call. When omitted, the caller's saved default engine (if one was saved) is used; when only one engine is configured, that one is used.",
    ),
}

export interface EngineContext {
  engineId: string
  baseUrl: string
  cockpitUrl?: string
  /** Vendor provider of the resolved engine (cockpit routes, branding). */
  provider: EngineProvider
}

/**
 * Lifts a handler written against a single `Client` into a handler that
 * resolves the engine from the registry (override > saved default >
 * single-default) before delegating. Keeps individual tool files small — the
 * only diff is the `withEngine(...)` wrap and adding `...engineParamShape` to
 * `inputSchema`.
 *
 * The optional third argument is the tool call's context: its `signal`
 * aborts the engine READS (GET/HEAD/OPTIONS — `withCallerSignal`) when the
 * MCP client cancels the request or disconnects; writes always run to
 * completion or the client's own deadline. Since toolkit 2.6 the registrar
 * calls handlers as `(client, args, ctx)` with mcp-use's `ctx`, so this is
 * live for EVERY registrar tool wrapped here, not only the widget feeds: a
 * multi-step handler can stop at any read — before its write, or after a
 * write that has landed — but never aborts the write itself. Pinned in
 * `tools/engine-errors.test.ts`.
 */
export function withEngine<TArgs extends { engine?: string }, TResult>(
  fn: (client: Client, args: TArgs, ctx: EngineContext) => Promise<TResult>,
): (registry: EngineRegistry, args: TArgs, call?: EngineCallContext) => Promise<TResult> {
  return async (registry, args, call) => {
    const { client, engineId, baseUrl, cockpitUrl, provider } = await resolveEngine(
      args.engine,
      registry,
      call,
    )
    return fn(client, args, { engineId, baseUrl, cockpitUrl, provider })
  }
}
