import { fontFaces } from "@miragon/mcp-toolkit-ui"
import { getPublicBaseUrl } from "mcp-use/react"
import { SERVED_FONT_FILES, servedFontBaseUrl } from "../served-fonts.js"

/** The `<style>` that carries the faces — one per document. */
export const SERVED_FONTS_STYLE_ID = "__miragon-served-fonts"

/**
 * Declare Geist and Geist Mono from the server that served this view (its
 * font route, `installFontAssets`), once per document, `font-display: swap`:
 * the text renders at once in the next family of the role stacks — the
 * host's font (`adoptHostFontVariables`), then the system's — and switches
 * when the files arrive. A host that blocks the server's origin, or a server
 * the browser cannot reach, leaves it there; nothing waits and nothing
 * breaks. Outside a served view document (no public base) nothing is
 * declared. Returns the base URL the faces load from, if any.
 */
export function declareServedFonts(
  doc: Document = document,
  publicBase: string = getPublicBaseUrl(),
): string | undefined {
  const existing = doc.getElementById(SERVED_FONTS_STYLE_ID)
  if (existing) return existing.dataset.baseUrl
  const baseUrl = servedFontBaseUrl(publicBase)
  if (!baseUrl) return undefined
  let css: string
  try {
    css = fontFaces({ baseUrl, files: SERVED_FONT_FILES })
  } catch {
    // A base the helper refuses to write into url("…") (quotes, brackets).
    return undefined
  }
  const style = doc.createElement("style")
  style.id = SERVED_FONTS_STYLE_ID
  style.dataset.baseUrl = baseUrl
  style.textContent = css
  doc.head.appendChild(style)
  return baseUrl
}
