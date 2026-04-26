/**
 * URL builders for jump-out links into the CIB seven Cockpit web UI.
 *
 * The Cockpit lives at `<webapp-base>/#/seven/auth/...`. All builders are
 * scheme-validated (only `http(s):` is accepted) and URL-encode user-supplied
 * keys/ids so reserved characters cannot break the resulting hash route.
 */

/**
 * Resolves the canonical webapp base URL — the part *before* the hash route.
 * Returns e.g. `http://localhost:8080/webapp`. Used by every Cockpit jump-out.
 *
 * Falls back to deriving the webapp base from `baseUrl` (`/engine-rest` →
 * `/webapp`) when an explicit `cockpitUrl` is not configured. Returns `null`
 * when the input is not an http(s) URL or no base can be derived.
 */
function resolveCockpitBase(cockpitUrl: string | undefined, baseUrl: string): string | null {
  let base = cockpitUrl?.trim()
  if (!base) {
    if (!baseUrl.endsWith("/engine-rest")) return null
    base = baseUrl.replace(/\/engine-rest$/, "/webapp")
  }
  if (!/^https?:/i.test(base)) return null
  return base.replace(/[/#]+$/, "")
}

export interface ProcessCockpitUrlOptions {
  /** Cockpit tab to open by default (e.g. `"incidents"`, `"history"`). */
  tab?: string
}

/**
 * Build a Cockpit URL pointing at a single process definition page.
 * Returns `null` if no webapp base can be resolved.
 */
export function buildProcessCockpitUrl(
  cockpitUrl: string | undefined,
  baseUrl: string,
  processDefinitionKey: string,
  options?: ProcessCockpitUrlOptions,
): string | null {
  const base = resolveCockpitBase(cockpitUrl, baseUrl)
  if (!base) return null
  const encodedKey = encodeURIComponent(processDefinitionKey)
  const tabSuffix = options?.tab ? `?tab=${encodeURIComponent(options.tab)}` : ""
  return `${base}/#/seven/auth/process/${encodedKey}${tabSuffix}`
}

/**
 * Build a Cockpit URL pointing at a single process *instance* page.
 */
export function buildInstanceCockpitUrl(
  cockpitUrl: string | undefined,
  baseUrl: string,
  processInstanceId: string,
): string | null {
  const prefix = buildInstanceCockpitUrlPrefix(cockpitUrl, baseUrl)
  if (!prefix) return null
  return `${prefix}${encodeURIComponent(processInstanceId)}`
}

/**
 * Returns the URL prefix for a process-instance Cockpit page (everything up
 * to but not including the encoded instance id). Useful when many incidents
 * need their own jump-out and the widget wants to construct them client-side
 * without re-implementing the base resolution.
 */
export function buildInstanceCockpitUrlPrefix(
  cockpitUrl: string | undefined,
  baseUrl: string,
): string | null {
  const base = resolveCockpitBase(cockpitUrl, baseUrl)
  if (!base) return null
  return `${base}/#/seven/auth/process-instance/`
}
