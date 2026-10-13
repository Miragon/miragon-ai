import { useLayoutEffect, type CSSProperties, type ReactNode } from "react"
import { adoptHostFontVariables } from "@miragon/mcp-toolkit-ui"
import { declareServedFonts } from "./declare-served-fonts.js"
import { InlineFitBox, UNSTATED_BUDGET } from "./inline-fit.js"
import { useShellHost } from "./shell-host.js"

const HOST_FONTS_ID = "__mcp-host-fonts"

/** Fullscreen/PiP: the view owns the viewport — fill it, scroll inside. */
const FILL_STYLE: CSSProperties = {
  position: "relative",
  height: "100%",
  minHeight: "100%",
  display: "flex",
  flexDirection: "column",
}
/** Inline without a host budget: no box of its own — content decides the height. */
const INLINE_STYLE: CSSProperties = { display: "contents" }

/**
 * The document layer under every view (replaces mcp-use's `ThemeProvider`,
 * whose theme channel wrote only `data-theme` from the host/OS and reset
 * `color-scheme` — the shell's `useApplyTheme` owns the theme now, from ONE
 * resolution):
 *  - Geist and Geist Mono are declared once from the server that served the
 *    view (`declareServedFonts`, `font-display: swap`);
 *  - the host's SEP-1865 style variables land on `<html>` and its font CSS is
 *    injected once; right after, the toolkit's `adoptHostFontVariables` moves
 *    the host's `--font-sans`/`--font-mono` into the fallback slot of the
 *    theme's font roles (`--host-font-*`), so the stack stays Geist first,
 *    then the host's font (what renders while Geist loads, or when the host
 *    blocks the server's origin), then the system;
 *  - inline views size to their content (auto-resize reports it), their lists
 *    show as many rows as fit the host's height budget (`containerDimensions`
 *    → `maxHeight`, else {@link UNSTATED_BUDGET}; the measured fit,
 *    `InlineFitBox`), and a view that still does not fit a stated budget
 *    scrolls inside it instead of being clipped;
 *  - fullscreen/PiP fill the viewport (`html`/`body`/`#root` at 100%).
 */
export function HostDocument({ children }: { children: ReactNode }) {
  const { styleVariables, fontCss, displayMode, maxHeight } = useShellHost()

  useLayoutEffect(() => {
    declareServedFonts()
  }, [])

  useLayoutEffect(() => {
    if (!styleVariables) return
    const root = document.documentElement
    for (const [name, value] of Object.entries(styleVariables)) {
      if (value !== undefined) root.style.setProperty(name, value)
    }
    adoptHostFontVariables(root.style, styleVariables)
  }, [styleVariables])

  useLayoutEffect(() => {
    if (!fontCss || document.getElementById(HOST_FONTS_ID)) return
    const style = document.createElement("style")
    style.id = HOST_FONTS_ID
    style.textContent = fontCss
    document.head.appendChild(style)
  }, [fontCss])

  const fill = displayMode === "fullscreen" || displayMode === "pip"
  useFillDocument(fill)

  let style = INLINE_STYLE
  if (fill) style = FILL_STYLE
  else if (maxHeight !== undefined) style = { maxHeight, overflowY: "auto" }
  return (
    <InlineFitBox active={!fill} budget={maxHeight ?? UNSTATED_BUDGET} style={style}>
      {children}
    </InlineFitBox>
  )
}

/** `html`/`body`/`#root` at 100% while the view fills the host; restored on exit. */
function useFillDocument(fill: boolean): void {
  useLayoutEffect(() => {
    if (!fill) return
    const elements = [
      document.documentElement,
      document.body,
      document.getElementById("root"),
    ].filter((el): el is HTMLElement => el !== null)
    const previous = elements.map((el) => [el.style.height, el.style.minHeight] as const)
    for (const el of elements) {
      el.style.height = "100%"
      el.style.minHeight = "100%"
    }
    return () => {
      elements.forEach((el, i) => {
        el.style.height = previous[i][0]
        el.style.minHeight = previous[i][1]
      })
    }
  }, [fill])
}
