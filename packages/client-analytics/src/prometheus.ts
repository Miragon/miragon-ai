export interface PrometheusConfig {
  url: string
}

/** One labeled sample from a Prometheus instant query. */
export interface PromSample {
  metric: Record<string, string>
  value: number
}

export interface PrometheusClient {
  /** Run an instant PromQL query and return the labeled samples (NaN/∅ dropped). */
  instant(query: string): Promise<PromSample[]>
}

interface PromApiResponse {
  status: "success" | "error"
  error?: string
  data?: {
    resultType: string
    result: Array<{ metric: Record<string, string>; value: [number, string] }>
  }
}

/**
 * Minimal Prometheus HTTP API client. The analytics queries are metric-first:
 * they issue instant PromQL queries (`/api/v1/query`) whose range windows carry
 * the time period, and map the labeled samples into the analytics row shapes.
 */
export function createPrometheusClient(config: PrometheusConfig): PrometheusClient {
  const base = config.url.replace(/\/+$/, "")
  return {
    async instant(query: string): Promise<PromSample[]> {
      const url = `${base}/api/v1/query?query=${encodeURIComponent(query)}`
      let response: Response
      try {
        response = await fetch(url, { method: "GET" })
      } catch (err) {
        const cause = (err as { cause?: { code?: string; message?: string } }).cause
        const detail = `${cause?.code ?? ""} ${cause?.message ?? (err as Error).message}`.trim()
        throw new Error(`Prometheus request to ${base} failed: ${detail}`)
      }
      if (!response.ok) {
        throw new Error(`Prometheus query failed (${response.status}): ${await response.text()}`)
      }
      const body = (await response.json()) as PromApiResponse
      if (body.status !== "success" || !body.data) {
        throw new Error(`Prometheus query error: ${body.error ?? "unknown"}`)
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

/** Escape a value for safe use inside a PromQL label matcher (`{k="<value>"}`). */
export function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export type EngineFilterInput = string | string[] | undefined

/**
 * Builds a PromQL label matcher fragment for the optional `engine_id` filter,
 * e.g. `engine_id="prod-a"` or `engine_id=~"prod-a|prod-b"`. Returns `undefined`
 * when no filter is set so the caller can aggregate across all engines.
 */
export function engineMatcher(engine: EngineFilterInput): string | undefined {
  if (engine === undefined || engine === null) return undefined
  if (Array.isArray(engine)) {
    if (engine.length === 0) return undefined
    return `engine_id=~"${engine.map(escapeLabelValue).join("|")}"`
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
 * PromQL range windows for the analytics `period` inputs. Capped at `30d` to
 * match the Prometheus retention (`--storage.tsdb.retention.time`); longer
 * look-backs would silently read partial/zero data, so they are not offered.
 */
export const PERIOD_RANGE = {
  "1d": "1d",
  "3d": "3d",
  "7d": "7d",
  "14d": "14d",
  "30d": "30d",
} as const
export type Period = keyof typeof PERIOD_RANGE
