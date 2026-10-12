/**
 * Geist and Geist Mono as a composed server serves them — the one contract
 * between the font route (`installFontAssets`, server path) and the views
 * that load the faces (`HostDocument`, UI path). Dependency-free, so it is
 * exported from both `/server` and `/widgets` without pulling node or React
 * code into the other side.
 *
 * Self-hosted on purpose (Miragon design system §4: no CDN, offline-capable,
 * GDPR-safe): the files come from the `@fontsource-variable/geist(-mono)`
 * packages, latin subset, variable weight 100–900.
 */

/**
 * Where the server serves the files. The path names the fontsource release
 * the files come from, so a font update changes every URL and the route can
 * be cached `immutable`; `served-fonts.test.ts` holds it equal to the
 * installed packages.
 */
export const SERVED_FONT_PATH = "/fonts/geist-5.3.0"

/** The latin variable woff2 files under {@link SERVED_FONT_PATH} (the toolkit's `GEIST_FONT_FILES`). */
export const SERVED_FONT_FILES = {
  sans: "geist-latin-wght-normal.woff2",
  mono: "geist-mono-latin-wght-normal.woff2",
} as const

/**
 * The base URL a view loads the faces from: {@link SERVED_FONT_PATH} on the
 * origin of the view's public base (mcp-use's `getPublicBaseUrl()`, resolved
 * per `resources/read`: `MCP_URL`'s origin, else the origin the host read the
 * view from). The same origin is the one the view's CSP admits in
 * `resourceDomains`. `undefined` outside a served view document (no base) or
 * for a base that is no http(s) URL — the view then declares no face and the
 * host's font renders.
 *
 * @example
 * servedFontBaseUrl("https://mcp.example.com/mcp/_mcp-use/public/")
 * // "https://mcp.example.com/fonts/geist-5.3.0"
 */
export function servedFontBaseUrl(publicBase: string | undefined): string | undefined {
  if (!publicBase) return undefined
  let base: URL
  try {
    base = new URL(publicBase)
  } catch {
    return undefined
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") return undefined
  return `${base.origin}${SERVED_FONT_PATH}`
}
