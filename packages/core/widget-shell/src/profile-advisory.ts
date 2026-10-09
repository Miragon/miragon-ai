/**
 * Advisory profile reads — for paths that only PREFER the profile (the
 * summary locale, a saved default engine) and must keep working without it.
 *
 * With `DATABASE_URL` the profile store is a network call, and a preferences
 * outage must never fail a tool whose data comes from the engine or
 * Prometheus — nor put the driver's error text (internal host:port) into a
 * tool result. Save paths and the settings views stay strict: a write must
 * fail visibly.
 */

/** Stores currently failing, so an outage logs once instead of once per call. */
const failingStores = new WeakSet<object>()

/**
 * The error's class and code only — never its message: driver messages carry
 * the database host:port (and can carry user names), and this line must be
 * safe for any log sink. The readiness probe logs the full error for
 * operators.
 */
function describeStoreError(err: unknown): string {
  if (!(err instanceof Error)) return typeof err
  const code = (err as { code?: unknown }).code
  return typeof code === "string" || typeof code === "number" ? `${err.name} ${code}` : err.name
}

/**
 * Read `key`'s record, degrading every failure to "no record": no key, or a
 * store that throws (logged once per outage with a sanitized line, and once
 * when it recovers). Never throws.
 */
export async function readProfileAdvisory<T>(
  store: { get(key: string): Promise<T | undefined> },
  key: string | undefined,
): Promise<T | undefined> {
  if (key === undefined) return undefined
  try {
    const record = await store.get(key)
    if (failingStores.delete(store)) {
      console.warn("[profile-store] reachable again — saved preferences apply again")
    }
    return record
  } catch (err) {
    if (!failingStores.has(store)) {
      failingStores.add(store)
      console.warn(
        `[profile-store] read failed (${describeStoreError(err)}) — preference lookups fall back to defaults until the store recovers`,
      )
    }
    return undefined
  }
}
