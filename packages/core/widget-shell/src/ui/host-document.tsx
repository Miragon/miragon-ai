import { useLayoutEffect, type CSSProperties, type ReactNode } from "react"
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
 *  - the host's SEP-1865 style variables land on `<html>` (so the host's
 *    `--font-sans`/`--font-mono` beat the shell's system stacks) and its font
 *    CSS is injected once;
 *  - inline views size to their content (auto-resize reports it) and, when the
 *    host states a height budget (`containerDimensions` → `maxHeight`), scroll
 *    inside it instead of being clipped;
 *  - fullscreen/PiP fill the viewport (`html`/`body`/`#root` at 100%).
 */
export function HostDocument({ children }: { children: ReactNode }) {
  const { styleVariables, fontCss, displayMode, maxHeight } = useShellHost()

  useLayoutEffect(() => {
    if (!styleVariables) return
    const root = document.documentElement
    for (const [name, value] of Object.entries(styleVariables)) {
      if (value !== undefined) root.style.setProperty(name, value)
    }
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
  return <div style={style}>{children}</div>
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
