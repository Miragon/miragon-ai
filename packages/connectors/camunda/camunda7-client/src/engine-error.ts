/**
 * Typed engine-call failures. hey-api throws whatever the engine sent — the
 * parsed `ExceptionDto` object for a JSON error body, the raw text otherwise,
 * `{}` for an empty body — and a bare `TypeError("fetch failed")` for network
 * failures. None of that is an `Error` carrying a readable message, so every
 * engine 4xx/5xx used to reach the model as "[object Object]". The client's
 * always-on error interceptor ([[createCamunda7Client]]) funnels every failure
 * through {@link toEngineRequestError} instead.
 */

/** What went wrong: an engine error response, no connection, the deadline, or the caller. */
export type EngineFailureKind = "http" | "unreachable" | "timeout" | "cancelled"

/** Upper bound for engine-supplied text in the message (stack traces, HTML error pages). */
const MAX_ENGINE_TEXT = 500

/**
 * An engine call that failed, with a model-actionable `message`:
 *
 * - `[404 InvalidRequestException] Process instance with id x does not exist (engine prod-a)`
 * - `[500] Internal Server Error — empty response body (engine prod-a)`
 * - `engine prod-a unreachable (ECONNREFUSED)`
 * - `engine prod-a did not respond within 30000 ms (timeout)`
 *
 * The HTTP status is `httpStatus`, deliberately NOT `status` (and the
 * engine's numeric error code is `engineCode`, not `code`): the toolkit's
 * `withToolErrors` prefixes any `status`/`code` property as `[…] `, which
 * would print the status twice — the message is complete on its own.
 */
export class EngineRequestError extends Error {
  readonly kind: EngineFailureKind
  /** HTTP status of the engine's error response; `undefined` when none arrived. */
  readonly httpStatus?: number
  /** The engine's exception class (`ExceptionDto.type`), e.g. `InvalidRequestException`. */
  readonly type?: string
  /** The engine's own message (or the truncated body / failure detail), undecorated. */
  readonly engineMessage: string
  /** The engine's numeric error code (`ExceptionDto.code`), when it sent one. */
  readonly engineCode?: number
  /** Id of the configured engine the request went to, when the client knows it. */
  readonly engineId?: string

  constructor(
    message: string,
    details: {
      kind: EngineFailureKind
      engineMessage: string
      httpStatus?: number
      type?: string
      engineCode?: number
      engineId?: string
      cause?: unknown
    },
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = "EngineRequestError"
    this.kind = details.kind
    this.httpStatus = details.httpStatus
    this.type = details.type
    this.engineMessage = details.engineMessage
    this.engineCode = details.engineCode
    this.engineId = details.engineId
  }
}

/** Collapses whitespace and caps engine-supplied text at {@link MAX_ENGINE_TEXT}. */
function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > MAX_ENGINE_TEXT ? `${flat.slice(0, MAX_ENGINE_TEXT)}…` : flat
}

function stringField(value: unknown, key: string): string | undefined {
  const field = (value as Record<string, unknown>)[key]
  return typeof field === "string" && field.length > 0 ? field : undefined
}

/**
 * The engine-side detail of an error response: hey-api hands the error
 * interceptor the parsed JSON body, else the raw text (`""` when empty).
 */
function describeBody(
  body: unknown,
  response: Response,
): { type?: string; engineMessage: string; engineCode?: number } {
  let type: string | undefined
  let engineCode: number | undefined
  let text: string
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    // ExceptionDto {type, message, code}; `error` covers proxies/gateways.
    type = stringField(body, "type")
    const code = (body as Record<string, unknown>).code
    engineCode = typeof code === "number" ? code : undefined
    const message = stringField(body, "message") ?? stringField(body, "error")
    text = message ?? (Object.keys(body).length > 0 ? JSON.stringify(body) : "")
  } else {
    text = typeof body === "string" ? body : body == null ? "" : JSON.stringify(body)
  }
  const engineMessage = clip(text)
  if (engineMessage) return { type, engineMessage, engineCode }
  return {
    type,
    engineCode,
    engineMessage: response.statusText
      ? `${response.statusText} — empty response body`
      : "empty response body",
  }
}

/** The OS-level failure code of a fetch network error (`ECONNREFUSED`, `ENOTFOUND`, …). */
function networkCode(error: TypeError): string {
  const cause = error.cause as { code?: unknown; errors?: Array<{ code?: unknown }> } | undefined
  const code = cause?.code ?? cause?.errors?.find((e) => e.code)?.code
  return typeof code === "string" && code.length > 0 ? code : "network error"
}

export interface EngineErrorContext {
  /** The engine's error response; `undefined` when none arrived. */
  response?: Response
  /** The request as sent (after the client's own interceptors). */
  request?: Request
  /** Engine id for the message suffix; omitted when unknown. */
  engineId?: string
  /** The per-request deadline, for the timeout message. */
  timeoutMs: number
  /** Whether THIS client's deadline (not a caller signal) aborted the request. */
  timedOut: boolean
  /** Appended as a sentence to 401 messages (auth-type-specific remedy). */
  unauthorizedHint?: string
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/** An aborted request: this client's deadline, or the caller's signal. */
function abortError(error: unknown, request: Request, ctx: EngineErrorContext) {
  const engine = ctx.engineId ? `engine ${ctx.engineId}` : "engine"
  if (!ctx.timedOut) {
    return new EngineRequestError(`request to ${engine} was cancelled by the caller`, {
      kind: "cancelled",
      engineMessage: "cancelled by the caller",
      engineId: ctx.engineId,
      cause: error,
    })
  }
  const write = SAFE_METHODS.has(request.method)
    ? ""
    : ` — the ${request.method} may still have been applied; check the current state before retrying`
  return new EngineRequestError(
    `${engine} did not respond within ${ctx.timeoutMs} ms (timeout)${write}`,
    {
      kind: "timeout",
      engineMessage: `no response within ${ctx.timeoutMs} ms`,
      engineId: ctx.engineId,
      cause: error,
    },
  )
}

/**
 * Maps whatever a failed engine call threw to an {@link EngineRequestError}.
 * Errors that are none of the four kinds (e.g. a request that could not even
 * be built) pass through unchanged — they already carry their own message.
 */
export function toEngineRequestError(error: unknown, ctx: EngineErrorContext): unknown {
  if (error instanceof EngineRequestError) return error
  const { response, request, engineId } = ctx
  const engine = engineId ? `engine ${engineId}` : "engine"
  const suffix = engineId ? ` (engine ${engineId})` : ""

  // Abort first: a deadline that fires while the error BODY is being read
  // still arrives with a response.
  if (request?.signal.aborted) return abortError(error, request, ctx)

  if (response && !response.ok) {
    const { type, engineMessage, engineCode } = describeBody(error, response)
    const head = `[${response.status}${type ? ` ${type}` : ""}] ${engineMessage}${suffix}`
    const hint = response.status === 401 && ctx.unauthorizedHint ? `. ${ctx.unauthorizedHint}` : ""
    return new EngineRequestError(`${head}${hint}`, {
      kind: "http",
      httpStatus: response.status,
      type,
      engineMessage,
      engineCode,
      engineId,
    })
  }

  if (!response && request && error instanceof TypeError) {
    const code = networkCode(error)
    return new EngineRequestError(`${engine} unreachable (${code})`, {
      kind: "unreachable",
      engineMessage: code,
      engineId,
      cause: error,
    })
  }

  return error
}
