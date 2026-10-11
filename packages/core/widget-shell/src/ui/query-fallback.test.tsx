// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { QueryFallback } from "./query-fallback.js"

afterEach(cleanup)

const SKELETON = <div>loading skeleton</div>

describe("QueryFallback: a two-part error text", () => {
  it("renders the skeleton while the query has not errored", () => {
    render(<QueryFallback isError={false} errorTitle="Could not load" skeleton={SKELETON} />)
    expect(screen.getByText("loading skeleton")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("says what happened, the cause, and what the user can do — in that order", () => {
    render(
      <QueryFallback
        isError
        error={new Error("fetch failed: ECONNREFUSED")}
        errorTitle="Could not load the process definitions"
        errorHint="Check that the engine is reachable, then open the view again."
        skeleton={SKELETON}
      />,
    )
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toBe(
      "Could not load the process definitions" +
        "fetch failed: ECONNREFUSED" +
        "Check that the engine is reachable, then open the view again.",
    )
    // The hint sits in the description, never in the one-line (clamped) title.
    const title = screen.getByText("Could not load the process definitions")
    expect(title.textContent).not.toContain("Check that")
    expect(screen.queryByText("loading skeleton")).toBeNull()
  })

  it("keeps the hint when the query reports no message", () => {
    render(
      <QueryFallback
        isError
        error="not an Error"
        errorTitle="Could not load"
        errorHint="Open the view again."
        skeleton={SKELETON}
      />,
    )
    expect(screen.getByRole("alert").textContent).toBe("Could not loadOpen the view again.")
  })

  it("renders the title alone without a cause or a hint", () => {
    render(<QueryFallback isError errorTitle="Could not load" skeleton={SKELETON} />)
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toBe("Could not load")
    expect(alert.querySelector('[data-slot="alert-description"]')).toBeNull()
  })
})
