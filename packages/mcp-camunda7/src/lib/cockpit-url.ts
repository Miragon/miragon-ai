/**
 * URL builders for jump-out links into the CIB seven Cockpit web UI.
 *
 * The Cockpit lives at `<webapp-base>/#/seven/auth/...`. All builders are
 * scheme-validated (only `http(s):` is accepted) and URL-encode user-supplied
 * keys/ids so reserved characters cannot break the resulting hash route.
 *
 * Routing convention (CIB seven Cockpit):
 *   process definition → /seven/auth/process/{key}[/{version}]?tab=...
 *   process instance   → /seven/auth/process/{key}[/{version}]/{instanceId}?tab=...
 *
 * When `version === null` we omit the version segment entirely; Cockpit
 * resolves bare `/process/{key}` and `/process/{key}/{instanceId}` to the
 * latest version. We do NOT substitute a placeholder like "latest" — the
 * route would 404.
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

export interface CockpitUrlOptions {
  /** Cockpit tab to open by default (e.g. `"incidents"`, `"variables"`, `"history"`). */
  tab?: string
}

function tabSuffix(tab: string | undefined): string {
  return tab ? `?tab=${encodeURIComponent(tab)}` : ""
}

/**
 * Build a Cockpit URL pointing at a single process definition page.
 * Returns `null` if no webapp base can be resolved.
 */
export function buildProcessCockpitUrl(
  cockpitUrl: string | undefined,
  baseUrl: string,
  processDefinitionKey: string,
  version: number | null,
  options?: CockpitUrlOptions,
): string | null {
  const base = resolveCockpitBase(cockpitUrl, baseUrl)
  if (!base) return null
  const encodedKey = encodeURIComponent(processDefinitionKey)
  const versionSegment = version !== null ? `/${version}` : ""
  return `${base}/#/seven/auth/process/${encodedKey}${versionSegment}${tabSuffix(options?.tab)}`
}

/**
 * Build a Cockpit URL pointing at a single process *instance* page.
 *
 * The instance page lives under the process route: `/process/{key}[/{version}]/{instanceId}`.
 */
export function buildInstanceCockpitUrl(
  cockpitUrl: string | undefined,
  baseUrl: string,
  processDefinitionKey: string,
  version: number | null,
  processInstanceId: string,
  options?: CockpitUrlOptions,
): string | null {
  const base = resolveCockpitBase(cockpitUrl, baseUrl)
  if (!base) return null
  const encodedKey = encodeURIComponent(processDefinitionKey)
  const versionSegment = version !== null ? `/${version}` : ""
  const encodedInstance = encodeURIComponent(processInstanceId)
  return `${base}/#/seven/auth/process/${encodedKey}${versionSegment}/${encodedInstance}${tabSuffix(options?.tab)}`
}
