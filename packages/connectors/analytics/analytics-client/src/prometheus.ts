export interface PrometheusConfig {
  /**
   * Base URL of the Prometheus HTTP API. Userinfo (`https://user:pass@host`)
   * is moved into a Basic `Authorization` header — fetch rejects credentialed
   * URLs — and never appears in an error message.
   */
  url: string
  /** Bearer token (`Authorization: Bearer …`); exclusive with basic auth. */
  bearerToken?: string
  /** Basic-auth user (with `password`); exclusive with `bearerToken` and URL userinfo. */
  username?: string
  password?: string
  /** Extra request headers, e.g. a tenant header (`X-Scope-OrgID`) for Mimir/Cortex/Thanos. */
  headers?: Record<string, string>
  /** Per-query deadline in ms (default {@link DEFAULT_PROMETHEUS_TIMEOUT_MS}). */
  timeoutMs?: number
}

/** Default per-query deadline (`timeoutMs`). */
export const DEFAULT_PROMETHEUS_TIMEOUT_MS = 30_000

/** The longest delay a Node timer holds — a longer deadline would fire at once. */
const MAX_TIMEOUT_MS = 2_147_483_647

/** Upper bound for upstream text in an error message (bodies can be pages long). */
const MAX_ERROR_TEXT = 500

/** One labeled sample from a Prometheus instant query. */
export interface PromSample {
  metric: Record<string, string>
  value: number
}

/** Per-query options. */
export interface PrometheusQueryOptions {
  /** Aborts the query (combined with the client's deadline), e.g. an MCP request's `ctx.signal`. */
  signal?: AbortSignal
}

export interface PrometheusClient {
  /** Run an instant PromQL query and return the labeled samples (NaN/∅ dropped). */
  instant(query: string, options?: PrometheusQueryOptions): Promise<PromSample[]>
}

interface PromApiResponse {
  status: "success" | "error"
  errorType?: string
  error?: string
  data?: {
    resultType: string
    result: Array<{ metric: Record<string, string>; value: [number, string] }>
  }
}

/**
 * Base URL without userinfo, plus the userinfo it carried. The raw value is
 * never echoed: it may hold credentials.
 */
function splitUserinfo(raw: string): { base: string; username?: string; password?: string } {
  let url: URL
  try {
    url = new URL(raw) // not URL.parse: that needs Node 22.1, the package supports 22.0
  } catch {
    // Not chained: the parse error carries the raw input.
    throw new Error("Prometheus URL (PROMETHEUS_URL) is not a valid URL")
  }
  const username = decodeURIComponent(url.username) || undefined
  const password = decodeURIComponent(url.password) || undefined
  url.username = ""
  url.password = ""
  return { base: url.toString().replace(/\/+$/, ""), username, password }
}

/**
 * The `Authorization` value from bearer token, explicit basic credentials or
 * URL userinfo — exactly one source; ambiguous combinations fail the boot.
 */
function authorizationFor(
  config: PrometheusConfig,
  userinfo: { username?: string; password?: string },
): { authorization?: string; secrets: Array<string | undefined> } {
  const explicitBasic = config.username !== undefined || config.password !== undefined
  if (userinfo.username !== undefined && (explicitBasic || config.bearerToken)) {
    throw new Error(
      "Prometheus auth is ambiguous: the URL carries credentials AND PROMETHEUS_USERNAME/PROMETHEUS_PASSWORD or PROMETHEUS_BEARER_TOKEN are set — use one",
    )
  }
  if (config.bearerToken && explicitBasic) {
    throw new Error(
      "Prometheus auth is ambiguous: set either PROMETHEUS_BEARER_TOKEN or PROMETHEUS_USERNAME + PROMETHEUS_PASSWORD, not both",
    )
  }
  if (explicitBasic && !(config.username && config.password)) {
    throw new Error("Prometheus basic auth needs both PROMETHEUS_USERNAME and PROMETHEUS_PASSWORD")
  }
  if (config.bearerToken) {
    return { authorization: `Bearer ${config.bearerToken}`, secrets: [config.bearerToken] }
  }
  const username = config.username ?? userinfo.username
  if (username === undefined) return { secrets: [] }
  const password = config.password ?? userinfo.password ?? ""
  const basic = Buffer.from(`${username}:${password}`).toString("base64")
  return { authorization: `Basic ${basic}`, secrets: [password, basic] }
}

/** RFC 9110 field-name token; a value must not break the header line. */
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const HEADER_VALUE = /^[^\r\n\0]*$/

/**
 * Every form a secret can take in echoed text — as configured, trimmed
 * (header values are sent trimmed) and whitespace-collapsed — longest first,
 * so a value is masked whole before any shorter one inside it. Values under
 * 4 characters are skipped: masking those would shred ordinary text.
 */
function secretForms(secrets: Array<string | undefined>): string[] {
  const forms = new Set<string>()
  for (const secret of secrets) {
    if (!secret) continue
    for (const form of [secret, secret.trim(), secret.replace(/\s+/g, " ").trim()]) {
      if (form.length >= 4) forms.add(form)
    }
  }
  return [...forms].sort((a, b) => b.length - a.length)
}

function mask(text: string, secrets: readonly string[]): string {
  let masked = text
  for (const secret of secrets) masked = masked.split(secret).join("***")
  return masked
}

/** A Prometheus API `errorType` (`bad_data`, `timeout`, …); anything else is not echoed. */
const ERROR_TYPE = /^[a-z_]{1,40}$/

/** The request headers (custom + auth) and every secret an upstream could echo back. */
function buildHeaders(
  config: PrometheusConfig,
  userinfo: { username?: string; password?: string },
): { headers: Headers; secrets: string[] } {
  const headers = new Headers()
  for (const [name, value] of Object.entries(config.headers ?? {})) {
    // Checked up front so the value (often a secret, e.g. an API key) never
    // lands in an error — only the header name is named.
    if (!HEADER_NAME.test(name) || !HEADER_VALUE.test(value)) {
      throw new Error(
        `Prometheus header "${name}" (PROMETHEUS_HEADERS) has an invalid name or value`,
      )
    }
    headers.set(name, value)
  }
  const { authorization, secrets } = authorizationFor(config, userinfo)
  if (authorization && headers.has("Authorization")) {
    throw new Error(
      "Prometheus auth is ambiguous: PROMETHEUS_HEADERS sets Authorization next to configured credentials",
    )
  }
  if (authorization) headers.set("Authorization", authorization)
  // The configured credential (not its header line, so an echo keeps the
  // scheme readable) plus every custom header value.
  return { headers, secrets: secretForms([...secrets, ...Object.values(config.headers ?? {})]) }
}

function resolveTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_PROMETHEUS_TIMEOUT_MS
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(
      `Prometheus timeout must be a positive integer of at most ${MAX_TIMEOUT_MS} ms, got ${timeoutMs}`,
    )
  }
  return timeoutMs
}

/** `JSON.parse` that yields `undefined` instead of throwing (bodies may be HTML or empty). */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** The OS-level code of a fetch network error (`ECONNREFUSED`, `ENOTFOUND`, …). */
function networkCode(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown; errors?: Array<{ code?: unknown }> } }).cause
  const code = cause?.code ?? cause?.errors?.find((e) => e.code)?.code
  return typeof code === "string" && code.length > 0 ? code : "network error"
}

/**
 * Minimal Prometheus HTTP API client. The analytics queries are metric-first:
 * they issue instant PromQL queries (`/api/v1/query`) whose range windows carry
 * the time period, and map the labeled samples into the analytics row shapes.
 *
 * Every query runs under a deadline (`timeoutMs`, combined with an optional
 * caller `signal`), and every failure is an `Error` whose message is safe to
 * hand to the model: no URL, no credentials, upstream text truncated.
 */
export function createPrometheusClient(config: PrometheusConfig): PrometheusClient {
  const userinfo = splitUserinfo(config.url)
  const { base } = userinfo
  const { headers, secrets } = buildHeaders(config, userinfo)
  const timeoutMs = resolveTimeout(config.timeoutMs)

  /**
   * Upstream text with every configured secret masked (before AND after
   * collapsing whitespace, so neither form slips through), then truncated.
   */
  const safe = (text: string): string => {
    const flat = mask(mask(text, secrets).replace(/\s+/g, " ").trim(), secrets)
    return flat.length > MAX_ERROR_TEXT ? `${flat.slice(0, MAX_ERROR_TEXT)}…` : flat
  }

  /** The envelope's `errorType` when it is a Prometheus one (masked all the same). */
  const errorTypeOf = (value: unknown): string | undefined =>
    typeof value === "string" && ERROR_TYPE.test(value) ? safe(value) : undefined

  function httpError(response: Response, text: string): Error {
    // The API's JSON error envelope when it is one, else the raw text.
    const body = parseJson(text) as Partial<PromApiResponse> | null | undefined
    const errorType = errorTypeOf(body?.errorType)
    const raw = typeof body?.error === "string" ? body.error : text
    const detail = safe(raw) || `${response.statusText || "HTTP error"} — empty response body`
    const auth = response.status === 401 || response.status === 403
    return new Error(
      `Prometheus query failed (${response.status}${errorType ? ` ${errorType}` : ""}): ${detail}${
        auth ? " — check the configured Prometheus credentials" : ""
      }`,
    )
  }

  /** Response + body under the deadline (and the caller's signal), failures mapped. */
  async function fetchText(
    url: string,
    caller: AbortSignal | undefined,
  ): Promise<{ response: Response; text: string }> {
    const deadline = AbortSignal.timeout(timeoutMs)
    const signal = caller ? AbortSignal.any([caller, deadline]) : deadline
    try {
      const response = await fetch(url, { method: "GET", headers, signal })
      return { response, text: await response.text() }
    } catch (err) {
      const message = deadline.aborted
        ? `Prometheus did not respond within ${timeoutMs} ms (timeout)`
        : caller?.aborted
          ? "Prometheus query cancelled by the caller"
          : `Prometheus unreachable (${networkCode(err)})`
      throw new Error(message, { cause: err })
    }
  }

  /** The API envelope of a 2xx response; a non-JSON body (a login page) says so. */
  function parseEnvelope(response: Response, text: string): PromApiResponse {
    const body = parseJson(text)
    if (body !== null && typeof body === "object") return body as PromApiResponse
    const type = response.headers.get("Content-Type")?.split(";")[0]
    throw new Error(
      `Prometheus returned a non-JSON response (HTTP ${response.status}${
        type ? `, ${type}` : ""
      }) — is a proxy or login page in front of it?`,
    )
  }

  return {
    async instant(query, options = {}) {
      const url = `${base}/api/v1/query?query=${encodeURIComponent(query)}`
      const { response, text } = await fetchText(url, options.signal)
      if (!response.ok) throw httpError(response, text)
      const body = parseEnvelope(response, text)
      if (body.status !== "success" || !body.data) {
        const errorType = errorTypeOf(body.errorType)
        throw new Error(
          `Prometheus query error${errorType ? ` (${errorType})` : ""}: ${safe(
            body.error ?? "unknown",
          )}`,
        )
      }
      const out: PromSample[] = []
      for (const r of body.data.result) {
        const value = Number(r.value[1])
        if (Number.isNaN(value)) continue
        out.push({ metric: r.metric, value })
      }
      return out
    },
  }
}

/**
 * A view of `client` whose queries honor the caller's `signal` (an MCP
 * request's `ctx.signal`) on top of the client's own deadline — every
 * Prometheus query is a read, so cancelling one is always safe. A per-call
 * `signal` wins. Without a signal the client itself is returned.
 */
export function withCallerSignal(
  client: PrometheusClient,
  signal: AbortSignal | undefined,
): PrometheusClient {
  if (!signal) return client
  return {
    instant: (query, options) =>
      client.instant(query, { ...options, signal: options?.signal ?? signal }),
  }
}

/** Escape a value for safe use inside a PromQL label matcher (`{k="<value>"}`). */
export function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/**
 * Escape RE2 metacharacters so a value matches literally inside a `=~"…"`
 * matcher. Without this, an id like `engine.prod` also matches `engineXprod`,
 * and one containing `|` silently splits into two alternatives.
 */
function escapeRegexValue(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export type EngineFilterInput = string | string[] | undefined

/**
 * The engine ids a filter names, or `null` for no filter (every engine
 * Prometheus holds). Results echo this so a reader always knows which engines
 * an aggregate covers.
 */
export function engineIdsOf(engine: EngineFilterInput): string[] | null {
  if (engine === undefined || engine === null) return null
  const ids = (Array.isArray(engine) ? engine : [engine]).filter((id) => id.length > 0)
  return ids.length > 0 ? ids : null
}

/**
 * Builds a PromQL label matcher fragment for the optional `engine_id` filter,
 * e.g. `engine_id="prod-a"` or `engine_id=~"prod-a|prod-b"` — one id is an
 * exact matcher whether it comes as a string or a one-element list (the
 * analytics tools always resolve `engine` to a list). Returns `undefined`
 * when no filter is set so the caller can aggregate across all engines.
 */
export function engineMatcher(engine: EngineFilterInput): string | undefined {
  if (engine === undefined || engine === null) return undefined
  if (Array.isArray(engine)) {
    if (engine.length === 0) return undefined
    if (engine.length === 1) return engineMatcher(engine[0])
    return `engine_id=~"${engine.map((e) => escapeLabelValue(escapeRegexValue(e))).join("|")}"`
  }
  if (engine.length === 0) return undefined
  return `engine_id="${escapeLabelValue(engine)}"`
}

/**
 * Assembles a `{...}` PromQL label selector from individual matcher fragments,
 * dropping empties. Returns `""` (no selector) when nothing is set.
 */
export function selector(...matchers: Array<string | undefined>): string {
  const parts = matchers.filter((m): m is string => !!m && m.length > 0)
  return parts.length ? `{${parts.join(",")}}` : ""
}

/**
 * The look-back the analytics module assumes Prometheus retains
 * (`--storage.tsdb.retention.time`, 30 days in the repo's stack). Every
 * window — the rolling periods, the compare windows, explicit date ranges —
 * is held inside `[now − RETENTION_DAYS, now]`: data older than that is gone,
 * so a longer window would silently read partial or zero data.
 */
export const RETENTION_DAYS = 30

/**
 * PromQL range windows for the analytics `period` inputs, capped at
 * {@link RETENTION_DAYS}; longer look-backs would silently read partial/zero
 * data, so they are not offered.
 */
export const PERIOD_RANGE = {
  "1d": "1d",
  "3d": "3d",
  "7d": "7d",
  "14d": "14d",
  "30d": "30d",
} as const
export type Period = keyof typeof PERIOD_RANGE

/**
 * The period values as a tuple, derived from {@link PERIOD_RANGE} — the single
 * source of truth for every `z.enum`/step-enum/type that offers the periods.
 * Adding a period to PERIOD_RANGE propagates everywhere.
 */
export const PERIODS = Object.keys(PERIOD_RANGE) as [Period, ...Period[]]
