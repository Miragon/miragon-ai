/**
 * Trims the input schemas `tools/list` advertises of keys that tell a model
 * nothing but cost characters on EVERY tool of every turn:
 *
 * - the `$schema` dialect URI zod stamps on each input schema;
 * - the ±`Number.MAX_SAFE_INTEGER` bounds zod emits for every `.int()` — no
 *   caller ever approaches them, and a real bound (`maxResults ≤ 100`, an
 *   offset `≥ 0`) stays untouched.
 *
 * Behaviour-neutral: input validation runs server-side against the zod
 * schemas, never against the advertised JSON. Output schemas stay untouched —
 * a client validates `structuredContent` against them, and the model never
 * reads them. Server path only.
 */

/** The narrow structural surface the middleware needs (an `MCPServer` satisfies it). */
export interface ToolListMiddlewareHost {
  use(
    pattern: "mcp:tools/list",
    fn: (ctx: unknown, next: () => Promise<unknown[]>) => Promise<unknown[]>,
  ): unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSafeIntegerBound(key: string, value: unknown): boolean {
  return (
    (key === "maximum" && value === Number.MAX_SAFE_INTEGER) ||
    (key === "minimum" && value === Number.MIN_SAFE_INTEGER)
  )
}

/** A copy of `node` without the safe-integer bounds, at every depth. */
function withoutSafeIntegerBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutSafeIntegerBounds)
  if (!isRecord(node)) return node
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key, value]) => !isSafeIntegerBound(key, value))
      .map(([key, value]) => [key, withoutSafeIntegerBounds(value)]),
  )
}

/** One advertised schema, trimmed: no root `$schema`, no safe-integer bounds. */
export function trimToolSchema(schema: unknown): unknown {
  if (!isRecord(schema)) return schema
  const rest = { ...schema }
  delete rest.$schema
  return withoutSafeIntegerBounds(rest)
}

/** One `tools/list` entry with its input schema trimmed. */
export function trimToolDescriptor(tool: unknown): unknown {
  if (!isRecord(tool) || !("inputSchema" in tool)) return tool
  return { ...tool, inputSchema: trimToolSchema(tool.inputSchema) }
}

export function installToolSchemaTrim(server: ToolListMiddlewareHost): void {
  server.use("mcp:tools/list", async (_ctx, next) => (await next()).map(trimToolDescriptor))
}
