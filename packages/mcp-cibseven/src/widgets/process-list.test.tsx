// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { ProcessListWidget } from "./process-list.js"
import type { ProcessListData } from "../view-models.js"

afterEach(cleanup)

const PROCESS_LIST: ProcessListData = {
  definitions: [
    {
      id: "d1",
      key: "invoice",
      name: "Invoice Process",
      version: 3,
      deploymentId: "dep-1",
      suspended: false,
      versionTag: null,
      tenantId: null,
    },
    {
      id: "d2",
      key: "onboarding",
      name: null,
      version: 1,
      deploymentId: "dep-2",
      suspended: true,
      versionTag: "v1",
      tenantId: null,
    },
  ],
  totalCount: 2,
  engineId: "default",
}

const Widget = ProcessListWidget as unknown as ComponentType<Record<string, unknown>>

describe("ProcessListWidget (fixture render)", () => {
  // NOTE: WidgetFixtureHost always seeds `data` (defaulting to {}), so it drives
  // the standalone data-provided path — not the in-widget self-fetch path, which
  // a host fixture can't reach. The self-fetch (`useViewToolQuery`) is exercised
  // live via the inspector.
  it("renders process definitions, version, and active/suspended status from data", () => {
    render(
      <WidgetFixtureHost
        widget={Widget}
        data={PROCESS_LIST as unknown as Record<string, unknown>}
      />,
    )

    expect(screen.getByText("Process Definitions")).toBeTruthy()

    // Renders the canonical definitions-table look (shared with the cockpit).
    expect(
      screen.getByRole("table", { name: "Deployed process definitions with version and status" }),
    ).toBeTruthy()

    // Named definition: name cell, mono key line, and active status.
    expect(screen.getByText("Invoice Process")).toBeTruthy()
    expect(screen.getByText("invoice")).toBeTruthy()
    expect(screen.getByText("Active")).toBeTruthy()

    // Second (suspended) definition rendered — status is unique to it.
    expect(screen.getByText("Suspended")).toBeTruthy()
  })
})
