import { z } from "zod"
import type { createToolRegistrar, ToolConfig } from "@miragon/mcp-toolkit-core/tools"
import type { Client } from "@miragon-ai/camunda7-client"
import type { EngineProvider } from "../engine-provider.js"
import { resolveEngine, type EngineCallContext, type EngineRegistry } from "./resolve-engine.js"

/**
 * The one-line `engine` description every camunda7 tool carries. The routing
 * rule itself (per-call `engine` > saved default > the only engine) is stated
 * ONCE in the module's server instructions (`instructions.ts`) — repeated on
 * every tool it was a fifth of the whole tool surface.
 */
export const ENGINE_PARAM_DESCRIPTION = "Engine id (see server instructions)"

/**
 * The optional `engine` parameter as the tool files declare it: spread into
 * every operations tool's input schema. When set it overrides the caller's
 * saved default engine for that one call; when omitted, [[resolveEngine]]
 * falls back to the saved default (or the only engine).
 *
 * The plugin advertises it narrowed to the CONFIGURED ids at boot
 * ([[withEngineParam]] for registrar tools, `WidgetToolsContext.engineParam`
 * for the widget path), so a model reads the valid ids off the schema. An id
 * outside the enum fails validation — exactly the ids `resolveEngine` would
 * reject as UNKNOWN_ENGINE anyway.
 */
export const engineParamShape = {
  engine: z.string().optional().describe(ENGINE_PARAM_DESCRIPTION),
}

/** The `engine` parameter shape, unconstrained or narrowed to the configured ids. */
export interface EngineParamShape {
  engine: z.ZodOptional<z.ZodType<string>>
}

/**
 * The boot-time `engine` parameter: an enum of the configured engine ids. A
 * single engine still yields a single-value enum — never a dropped property:
 * the widgets' Ask-AI hand-offs and prompts pass `engine` explicitly, and a
 * strict input would refuse an unknown key.
 */
export function engineParamShapeFor(engines: readonly { id: string }[]): EngineParamShape {
  const [first, ...rest] = engines.map((e) => e.id)
  if (first === undefined) return engineParamShape
  return {
    engine: z
      .enum([first, ...rest])
      .optional()
      .describe(ENGINE_PARAM_DESCRIPTION),
  }
}

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>
type ZodRawShape = Record<string, z.ZodType>

/**
 * Wraps a registrar so every tool that declares the {@link engineParamShape}
 * `engine` parameter is advertised with the boot-time enum of `engines`
 * instead ({@link engineParamShapeFor}). Only that exact placeholder is
 * swapped — a tool with its own `engine` field keeps it.
 */
export function withEngineParam(register: Register, engines: readonly { id: string }[]): Register {
  const { engine } = engineParamShapeFor(engines)
  const narrowed = <TShape extends ZodRawShape>(config: ToolConfig<EngineRegistry, TShape>) => {
    const shape = config.inputSchema
    if (shape?.engine !== engineParamShape.engine) return register(config)
    // Same field, narrower values: the handler's `engine?: string` holds.
    const narrowedConfig: ToolConfig<EngineRegistry, TShape> = {
      ...config,
      inputSchema: { ...shape, engine },
    }
    return register(narrowedConfig)
  }
  return Object.assign(narrowed, { getRegisteredTools: () => register.getRegisteredTools() })
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
