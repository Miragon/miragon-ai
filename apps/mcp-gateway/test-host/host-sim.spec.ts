import { expect, test, type Page } from "@playwright/test"

/**
 * Host-simulation gate for the widget shell (see test-host/README.md).
 *
 * Scenario "keep"  — a spec-conforming host delivers the tool result WITH
 * `structuredContent`: the shell must render from the notification alone and
 * must NOT re-execute the tool.
 *
 * Scenario "strip" — mimics claude.ai / Claude Desktop, which forward the
 * tool-result notification WITHOUT `structuredContent`: the shell must
 * recover via exactly ONE `tools/call` re-execution and then render. This
 * scenario is the acceptance gate for removing the interim fallback in
 * src/ui/main.tsx.
 */

const FIXTURE_TITLE = "Host-Sim Fixture View"
const RENDER_TOOL = "render-view"

async function renderToolCallCount(page: Page): Promise<number> {
  return await page.evaluate(
    ([tool]) =>
      (
        window as unknown as { __hostLog: { toolCalls: { name?: string }[] } }
      ).__hostLog.toolCalls.filter((c) => c.name === tool).length,
    [RENDER_TOOL],
  )
}

test("compliant host (structuredContent kept): renders without any re-fetch", async ({ page }) => {
  await page.goto("/host-sim.html?structuredContent=keep")
  const app = page.frameLocator("#app")
  await expect(app.locator("h2")).toHaveText(FIXTURE_TITLE, { timeout: 15_000 })
  // Give a gratuitous re-fetch a moment to (wrongly) fire before counting.
  await page.waitForTimeout(1_000)
  expect(await renderToolCallCount(page)).toBe(0)
})

test("stripping host (claude.ai behaviour): recovers via exactly one re-fetch", async ({
  page,
}) => {
  await page.goto("/host-sim.html?structuredContent=strip")
  const app = page.frameLocator("#app")
  await expect(app.locator("h2")).toHaveText(FIXTURE_TITLE, { timeout: 15_000 })
  await page.waitForTimeout(1_000)
  expect(await renderToolCallCount(page)).toBe(1)
})
