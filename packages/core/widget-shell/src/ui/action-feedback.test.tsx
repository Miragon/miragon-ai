// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, renderHook, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { LocaleProvider, ToastProvider } from "@miragon/mcp-toolkit-ui"
import { failureLine, useActionFeedback, type ActionFeedback } from "./action-feedback.js"

afterEach(cleanup)

/** The hook under a locale and a toast stack; the toasts render into the document. */
function renderIn(locale: string): ActionFeedback {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LocaleProvider locale={locale}>
      <ToastProvider>{children}</ToastProvider>
    </LocaleProvider>
  )
  return renderHook(() => useActionFeedback(), { wrapper }).result.current
}

const toastOf = (text: string) => screen.getByText(text).closest('[data-slot="toast"]')

describe("useActionFeedback (U9: a write is never silent)", () => {
  it("confirms a success with a success toast naming the object", () => {
    const feedback = renderIn("de")
    act(() => feedback.succeeded("Job für LEA-2026-00424 neu eingeplant"))
    expect(toastOf("Job für LEA-2026-00424 neu eingeplant")?.getAttribute("data-tone")).toBe(
      "success",
    )
  })

  it("passes a success's second line on", () => {
    const feedback = renderIn("en")
    act(() => feedback.succeeded("Settings saved", "They apply to every view."))
    expect(screen.getByText("They apply to every view.")).toBeTruthy()
  })

  it("reports a failure as a danger toast: the object, then why and what to do — not the raw text", () => {
    const feedback = renderIn("de")
    act(() =>
      feedback.failed(
        "Job für LEA-2026-00424 konnte nicht neu eingeplant werden",
        new Error("[503 ProcessEngineException] down (engine prod)"),
      ),
    )
    const toast = toastOf("Job für LEA-2026-00424 konnte nicht neu eingeplant werden")
    expect(toast?.getAttribute("data-tone")).toBe("danger")
    expect(toast?.textContent).toContain(
      "Die Engine prod ist nicht erreichbar (HTTP 503). Prüf, ob die Engine läuft, oder wähl eine andere Engine.",
    )
    expect(toast?.textContent).not.toContain("ProcessEngineException")
  })

  it("announces through the toolkit's polite live region", () => {
    const feedback = renderIn("en")
    act(() => feedback.succeeded("Saved"))
    const viewport = document.querySelector('[data-slot="toast-viewport"]')
    expect(viewport?.getAttribute("aria-live")).toBe("polite")
    expect(viewport?.textContent).toContain("Saved")
  })

  it("is a no-op outside a toast provider (a bare fixture never crashes)", () => {
    const { result } = renderHook(() => useActionFeedback())
    expect(() => result.current.succeeded("x")).not.toThrow()
    expect(() => result.current.failed("x", new Error("y"))).not.toThrow()
  })
})

describe("failureLine", () => {
  it("is the reason and the next step for a known kind, the next step alone otherwise", () => {
    expect(failureLine(new Error("engine p unreachable (ECONNREFUSED)"), "en")).toBe(
      "Engine p is unreachable. Check that the engine is running, or pick another engine.",
    )
    expect(failureLine(new Error("odd"), "en")).toBe(
      "Try again. If it fails again, ask in the chat.",
    )
  })
})
