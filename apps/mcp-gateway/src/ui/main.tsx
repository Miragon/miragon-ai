import * as React from "react"
import { StrictMode } from "react"
import * as ReactDOMClient from "react-dom/client"
import { createRoot } from "react-dom/client"
import { McpUseProvider } from "mcp-use/react"
import { McpAppView } from "@miragon/mcp-toolkit-ui/app"
import { widgetRegistry } from "./widget-registry.js"
import { ProfileGate } from "./profile-gate.js"
import "./globals.css"

// Expose host React + ReactDOM on globalThis so upstream-hosted widget bundles
// can resolve their externalised `react` / `react/jsx-runtime` imports through
// the importmap shim in `mcp-app.html`. Same React instance as the host —
// hooks + context rely on instance identity, not just version parity.
Object.assign(globalThis, { React, ReactDOM: ReactDOMClient })

// --- claude.ai-Interop-Fallback -------------------------------------------
// claude.ai (SEP-1865-Host) strippt `structuredContent` aus der
// `ui/notifications/tool-result`-Notification (verifiziert 2026-07-06, nur
// content-Blöcke kommen an). Die mcp-use-Bridge liest aber genau dieses Feld,
// wodurch jedes Widget im Lade-Skeleton hängen bleibt. Workaround: Kommt die
// Notification ohne `structuredContent`, führen wir den Tool-Call über die
// Host-Bridge erneut aus (Responses tragen `structuredContent` vollständig)
// und replayen das volle Ergebnis als selbst-gepostete tool-result-
// Notification an die eigene Bridge — sie macht keinen source-Check. Tool-
// Name/Argumente kommen aus `hostContext.toolInfo` bzw. der tool-input-
// Notification. Hosts, die die Spec einhalten (Inspector), erreichen den
// Fallback nie. Entfernen, sobald claude.ai oder mcp-use das Interop fixt.
const FALLBACK_CALL_ID = 990002
const fallbackState: {
  toolInputArgs: unknown
  toolInfo: Record<string, unknown> | null
  resultMissingSC: boolean
  started: boolean
} = {
  toolInputArgs: null,
  toolInfo: null,
  resultMissingSC: false,
  started: false,
}

function tryReexecuteToolCall() {
  if (!fallbackState.resultMissingSC || fallbackState.started) return
  const info = fallbackState.toolInfo
  const toolName =
    (info?.name as string | undefined) ??
    (info?.toolName as string | undefined) ??
    ((info?.tool as Record<string, unknown> | undefined)?.name as string | undefined)
  if (!toolName) return
  fallbackState.started = true
  window.parent.postMessage(
    {
      jsonrpc: "2.0",
      id: FALLBACK_CALL_ID,
      method: "tools/call",
      params: { name: toolName, arguments: fallbackState.toolInputArgs ?? {} },
    },
    "*",
  )
}

window.addEventListener("message", (event) => {
  const m = event.data as {
    jsonrpc?: string
    method?: string
    id?: unknown
    params?: Record<string, unknown>
    result?: Record<string, unknown>
  } | null
  if (!m || typeof m !== "object" || m.jsonrpc !== "2.0") return

  if (m.method === "ui/notifications/tool-input") {
    fallbackState.toolInputArgs = m.params?.arguments ?? null
  } else if (m.method === "ui/notifications/tool-result" && m.params) {
    if (!("structuredContent" in m.params)) {
      fallbackState.resultMissingSC = true
      tryReexecuteToolCall()
    }
  } else if (m.method === "ui/notifications/host-context-changed") {
    const info = m.params?.toolInfo
    if (info && typeof info === "object") {
      fallbackState.toolInfo = info as Record<string, unknown>
      tryReexecuteToolCall()
    }
  } else if (m.id === FALLBACK_CALL_ID && m.result) {
    if (m.result.structuredContent) {
      // Self-Replay: eigene Bridge verarbeitet die Notification, als käme
      // sie vom Host — diesmal mit structuredContent.
      window.postMessage(
        { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: m.result },
        "*",
      )
    }
  }
})

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Root element #root not found")

createRoot(rootElement).render(
  <StrictMode>
    <McpUseProvider>
      <ProfileGate>
        <McpAppView widgets={widgetRegistry} />
      </ProfileGate>
    </McpUseProvider>
  </StrictMode>,
)
