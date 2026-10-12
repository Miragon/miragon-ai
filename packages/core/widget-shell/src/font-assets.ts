/**
 * The font route of a composed server (server path only): Geist and Geist
 * Mono as woff2, served by THIS server so the views render the Miragon type
 * without a CDN (design system §4: self-hosted, offline-capable, GDPR-safe)
 * and without inlining ~50 KB of base64 into every view resource.
 *
 * A view runs in the host's sandboxed iframe on a foreign origin, so the
 * files travel cross-origin: the response allows any origin (CORS, CORP —
 * public static files, no credentials), and the view's CSP must admit the
 * server's origin in `resourceDomains` (`fontAssetsCsp` + mcp-use's own
 * request-resolved append). The URL is versioned (`SERVED_FONT_PATH`), so the
 * files are cached `immutable` for a year. Where a host blocks the origin or
 * cannot reach the server, `font-display: swap` keeps the text in the host's
 * font, then the system's — nothing waits for the files.
 *
 * Registered after the HTTP edge guard (`installHttpEdgeGuard`): a font GET
 * passes the `Origin` half (safe method) but not a foreign `Host`, like every
 * other non-operational route.
 */
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import type { AppResourceCsp } from "@miragon/mcp-toolkit-core"
import type { HttpRouteHost } from "./health.js"
import { SERVED_FONT_FILES, SERVED_FONT_PATH } from "./served-fonts.js"

/** A served file: its name under the route and its bytes. */
export interface FontAsset {
  file: string
  body: Uint8Array<ArrayBuffer>
}

/** A year, and never revalidated: a new font release is a new URL. */
export const FONT_CACHE_CONTROL = "public, max-age=31536000, immutable"

const require = createRequire(import.meta.url)

/**
 * Where the `@fontsource-variable` packages keep the files, by served name.
 * `require.resolve` with literal specifiers, so the dependency stays visible
 * to the dead-code check; `font-assets.test.ts` holds the names equal to
 * {@link SERVED_FONT_FILES}.
 */
export function servedFontPaths(): Record<string, string> {
  return {
    [SERVED_FONT_FILES.sans]:
      require.resolve("@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"),
    [SERVED_FONT_FILES.mono]:
      require.resolve("@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2"),
  }
}

/** The woff2 files, read once (boot). */
export function loadServedFonts(
  paths: () => Record<string, string> = servedFontPaths,
): FontAsset[] {
  return Object.entries(paths()).map(([file, path]) => ({ file, body: readFileSync(path) }))
}

/** The answer for one file — a fresh `Response` per request (a body is read once). */
export function fontResponse(body: Uint8Array<ArrayBuffer>): Response {
  return new Response(body, {
    headers: {
      "content-type": "font/woff2",
      "content-length": String(body.byteLength),
      "cache-control": FONT_CACHE_CONTROL,
      // Fonts are fetched in CORS mode from the view's sandboxed (often
      // opaque, `null`) origin; public files, so any origin and no credentials.
      "access-control-allow-origin": "*",
      "cross-origin-resource-policy": "cross-origin",
      "x-content-type-options": "nosniff",
    },
  })
}

export interface FontAssetsOptions {
  /** Route prefix (default {@link SERVED_FONT_PATH} — the views load from there). */
  path?: string
  /** The files (default {@link loadServedFonts}). */
  load?: () => FontAsset[]
  /** Log prefix for the warning when the files cannot be read (default `fonts`). */
  label?: string
}

/**
 * Register `GET <path>/<file>` for each served font. Returns the registered
 * routes — none when the files cannot be read: the boot goes on with a
 * warning and the views render the host's font (Geist is cosmetic, never a
 * reason to refuse service).
 */
export function installFontAssets(
  server: HttpRouteHost,
  options: FontAssetsOptions = {},
): string[] {
  const { path = SERVED_FONT_PATH, load = loadServedFonts, label = "fonts" } = options
  let assets: FontAsset[]
  try {
    assets = load()
  } catch (error) {
    console.warn(`[${label}] Geist is not served (views use the host's font):`, error)
    return []
  }
  return assets.map(({ file, body }) => {
    const route = `${path}/${file}`
    server.get(route, () => fontResponse(body))
    return route
  })
}

/**
 * The view CSP that admits the font origin explicitly: `MCP_URL`'s origin in
 * `resourceDomains` — the origin a view resolves its font URLs against
 * (`servedFontBaseUrl`). Handed to `createFrameworkApp` as `app.csp`, it
 * reaches `render-view` and every module widget tool (`honorWidgetMetaDefaults`),
 * on `resources/list` too, and the Apps SDK `openai/widgetCSP`. `undefined`
 * without `MCP_URL` (local dev): mcp-use still appends the request-resolved
 * server origin on every `resources/read`, which is where the view loads from.
 * Call it after `resolveHttpEdgePolicy` validated `MCP_URL`.
 */
export function fontAssetsCsp(env: NodeJS.ProcessEnv): AppResourceCsp | undefined {
  const url = env.MCP_URL?.trim()
  return url ? { resourceDomains: [new URL(url).origin] } : undefined
}
