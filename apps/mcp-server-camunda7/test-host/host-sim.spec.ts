import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test"
import { BROKEN_ENGINE, HEALTHY_ENGINE } from "./engines.js"

/**
 * Host-simulation gate for the built widget bundle (see test-host/README.md).
 *
 * Every scenario renders the view document the server ACTUALLY serves
 * (`resources/read` of `ui://views/camunda7_show_process_list.html` from the
 * real `createApp`, embedding `dist/mcp-app.{js,css}`) in a sandboxed srcdoc
 * iframe, behind a minimal SEP-1865 host whose tool calls go to that same
 * server. The rendering tool is a real camunda7 show tool against a stub
 * engine, so the view receives the real envelope and data shape.
 *
 * Scenarios titled "pinned …" assert the CURRENT behaviour of a known defect
 * that lives outside this repo's fix scope; each names its issue. When the
 * fix lands, the pin fails on purpose — flip it to the expected behaviour
 * stated in its assertion message.
 */

const RENDER_TOOL = "camunda7_show_process_list"
const PROFILE_FEED = "camunda7_user_profile_data"
/** The toolkit's `DEFAULT_ASSUME_STRIPPED_AFTER_MS` — the recovery grace timer. */
const RECOVERY_GRACE_MS = 2_500
const TOOLKIT_LIFECYCLE_ISSUE = "https://github.com/Miragon/mcp-toolkit/issues/176"
const TOOLKIT_HOST_CONTEXT_ISSUE = "https://github.com/Miragon/mcp-toolkit/issues/178"
const HOST_THEME_ISSUE = "https://github.com/Miragon/miragon-ai/issues/339"

interface HostLog {
  initialized: boolean
  delivered: "result" | "cancelled" | null
  originalResult: { isError?: boolean; content?: { type: string; text?: string }[] } | null
  toolCalls: { name: string; arguments: Record<string, unknown> }[]
  displayModeRequests: string[]
  sizeChanges: { width?: number; height?: number }[]
  methods: string[]
  errors: string[]
}

interface Scenario {
  args?: Record<string, unknown>
  structuredContent?: "keep" | "strip"
  resultDelayMs?: number
  cancel?: boolean
  theme?: "light" | "dark"
  displayModes?: string[]
}

async function openView(page: Page, scenario: Scenario = {}): Promise<FrameLocator> {
  const base = process.env.HOST_SIM_URL
  if (!base) throw new Error("HOST_SIM_URL is unset — run via `playwright test -c test-host`")
  const query = new URLSearchParams({
    tool: RENDER_TOOL,
    args: JSON.stringify(scenario.args ?? { engine: HEALTHY_ENGINE }),
    structuredContent: scenario.structuredContent ?? "keep",
    resultDelayMs: String(scenario.resultDelayMs ?? 0),
    theme: scenario.theme ?? "light",
  })
  if (scenario.cancel) query.set("cancel", "1")
  if (scenario.displayModes) query.set("displayModes", scenario.displayModes.join(","))
  await page.goto(`${base}/?${query.toString()}`)
  return page.frameLocator("#app")
}

async function hostLog(page: Page): Promise<HostLog> {
  return await page.evaluate(() => (window as unknown as { __hostLog: HostLog }).__hostLog)
}

/** tools/call requests the VIEW sent for the rendering tool — re-executions. */
async function reExecutions(page: Page): Promise<HostLog["toolCalls"]> {
  return (await hostLog(page)).toolCalls.filter((c) => c.name === RENDER_TOOL)
}

async function waitForDelivery(page: Page, expected: HostLog["delivered"]): Promise<void> {
  await expect.poll(async () => (await hostLog(page)).delivered, { timeout: 15_000 }).toBe(expected)
}

/** Console errors + uncaught exceptions of the page AND the view frame. */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text())
  })
  page.on("pageerror", (err) => errors.push(err.message))
  return errors
}

function definitionsTable(app: FrameLocator): Locator {
  return app.getByRole("table", { name: "Deployed process definitions with version and status" })
}

/** The process-list widget rendered the stub engine's three definitions. */
async function expectProcessList(app: FrameLocator): Promise<void> {
  const table = definitionsTable(app)
  await expect(table).toBeVisible({ timeout: 15_000 })
  // Header + one row per fixture definition, sorted by name like the engine.
  await expect(table.getByRole("row")).toHaveCount(4)
  await expect(table.getByRole("row").nth(1)).toContainText("Customer Onboarding")
  await expect(table.getByRole("row").nth(1)).toContainText("Suspended")
  await expect(table.getByRole("row").nth(2)).toContainText("Invoice Receipt")
  await expect(table.getByRole("row").nth(2)).toContainText("V3.0")
  await expect(table.getByRole("row").nth(3)).toContainText("Order Fulfillment")
  await expect(app.getByText("3 deployed")).toBeVisible()
}

/** Relative luminance (0 = black, 1 = white) of an element's computed text color. */
async function textLuminance(locator: Locator): Promise<number> {
  return await locator.evaluate((el) => {
    // A canvas normalizes any CSS color syntax (oklch, color-mix …) to sRGB.
    const ctx = document.createElement("canvas").getContext("2d")!
    ctx.fillStyle = getComputedStyle(el).color
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  })
}

test.describe("real camunda7 view (camunda7_show_process_list)", () => {
  test("compliant host (structuredContent kept): renders from the notification, never re-executes", async ({
    page,
  }) => {
    const errors = collectErrors(page)
    const app = await openView(page)

    await expectProcessList(app)
    // The view envelope's own title (McpAppView toolbar) — the layout is the
    // server's single-widget layout, not an empty one.
    await expect(app.getByRole("heading", { name: "Process Definitions" }).first()).toBeVisible()
    // Harness self-checks: the frame runs mcp-use's synthesized document
    // (its inline view config), sandboxed to an opaque origin.
    expect(
      await app.locator("html").evaluate(() => ({
        viewConfig: "__mcpUseViewConfig" in globalThis,
        origin: window.origin,
      })),
    ).toEqual({ viewConfig: true, origin: "null" })
    await waitForDelivery(page, "result")
    // Outlast the recovery grace timer: a conforming host must never trigger it.
    await page.waitForTimeout(RECOVERY_GRACE_MS + 1_000)

    const log = await hostLog(page)
    expect(await reExecutions(page)).toHaveLength(0)
    // The provider stack works in the real bundle: ProfileGate fetched the
    // profile through the host bridge (AppShellProviders order) …
    expect(log.toolCalls.map((c) => c.name)).toContain(PROFILE_FEED)
    // … and bootstrapView's auto-resize reports the rendered height to the host.
    expect(log.sizeChanges.at(-1)?.height ?? 0).toBeGreaterThan(200)
    expect(log.errors).toEqual([])
    // Nothing the served document needs is blocked by its own declared CSP,
    // and nothing throws.
    expect(errors).toEqual([])
  })

  test("in-widget query: the server-side search refetches through the app-only feed", async ({
    page,
  }) => {
    // The path the vite `dedupe` list protects (CLAUDE.md invariant 4): the
    // widget package's useToolQuery must see the shell's CallToolContext, or
    // every in-widget query hangs on its skeleton.
    const app = await openView(page)
    await expectProcessList(app)

    await app.getByPlaceholder("Filter by name…").fill("invoice")

    const table = definitionsTable(app)
    await expect(table.getByRole("row")).toHaveCount(2)
    await expect(table.getByRole("row").nth(1)).toContainText("Invoice Receipt")
    const feedCalls = (await hostLog(page)).toolCalls.filter(
      (c) => c.name === "camunda7_process_list_data",
    )
    expect(feedCalls.at(-1)?.arguments).toMatchObject({
      engine: HEALTHY_ENGINE,
      nameLike: "invoice",
    })
  })

  test("stripping host (claude.ai behaviour): recovers via exactly one re-execution with the invocation's arguments", async ({
    page,
  }) => {
    const app = await openView(page, { structuredContent: "strip" })

    await expectProcessList(app)
    await page.waitForTimeout(1_000)
    expect(await reExecutions(page)).toEqual([
      { name: RENDER_TOOL, arguments: { engine: HEALTHY_ENGINE } },
    ])
  })

  test(
    "pinned toolkit#176 (K13): a slow tool on a compliant host is re-executed once before its result arrives",
    { annotation: { type: "issue", description: TOOLKIT_LIFECYCLE_ISSUE } },
    async ({ page }) => {
      const app = await openView(page, { resultDelayMs: RECOVERY_GRACE_MS + 1_500 })

      // Rendered from the premature recovery, before the host delivered.
      await expectProcessList(app)
      await waitForDelivery(page, "result")
      await page.waitForTimeout(500)

      // Never a duplicate render: the host payload replaces the recovered one.
      await expect(definitionsTable(app)).toHaveCount(1)
      expect(
        await reExecutions(page),
        "toolkit#176 fixed? A compliant host's slow result must not trigger a re-execution — expect 0 and drop the pin",
      ).toHaveLength(1)
    },
  )

  test(
    "pinned toolkit#176 (K14): a tool error re-executes the tool once and leaves the loading skeleton",
    { annotation: { type: "issue", description: TOOLKIT_LIFECYCLE_ISSUE } },
    async ({ page }) => {
      const app = await openView(page, { args: { engine: BROKEN_ENGINE } })

      await waitForDelivery(page, "result")
      const log = await hostLog(page)
      // A genuine isError result from the real server (engine 503).
      expect(log.originalResult?.isError).toBe(true)
      await page.waitForTimeout(RECOVERY_GRACE_MS + 500)

      expect(
        await reExecutions(page),
        "toolkit#176 fixed? An isError result must never be re-executed — expect 0",
      ).toHaveLength(1)
      await expect(
        app.getByText("Waiting for pipeline result..."),
        "toolkit#176 fixed? The view must render the tool error instead of the loading skeleton",
      ).toBeVisible()
      await expect(definitionsTable(app)).toHaveCount(0)
    },
  )

  test("cancelled call: shows the cancellation and never re-executes", async ({ page }) => {
    const app = await openView(page, { cancel: true })

    await waitForDelivery(page, "cancelled")
    await expect(app.getByText("Tool call was cancelled.")).toBeVisible()
    await page.waitForTimeout(RECOVERY_GRACE_MS + 1_000)
    expect(await reExecutions(page)).toHaveLength(0)
    await expect(app.getByText("Tool call was cancelled.")).toBeVisible()
  })

  test("dark host on a dark OS: dark theme tokens (light text)", async ({ page }) => {
    // The control for the pin below: proves the luminance probe sees dark mode.
    await page.emulateMedia({ colorScheme: "dark" })
    const app = await openView(page, { theme: "dark" })

    await expectProcessList(app)
    expect(await textLuminance(definitionsTable(app).getByRole("row").nth(2))).toBeGreaterThan(0.5)
  })

  test(
    "pinned #339 (K41): a dark host on a light OS renders light theme tokens",
    { annotation: { type: "issue", description: HOST_THEME_ISSUE } },
    async ({ page }, testInfo) => {
      const app = await openView(page, { theme: "dark" })

      await expectProcessList(app)
      // mcp-use's ThemeProvider honors the host theme on the document …
      await expect(app.locator("html")).toHaveAttribute("data-theme", "dark")
      await testInfo.attach("dark-host-light-os", {
        body: await page.screenshot(),
        contentType: "image/png",
      })
      // … but every token keys on `.dark`, which follows the OS (light): dark
      // text on the host's dark canvas.
      expect(
        await textLuminance(definitionsTable(app).getByRole("row").nth(2)),
        "#339 fixed? The host theme must win — expect light text (luminance > 0.5)",
      ).toBeLessThan(0.5)
    },
  )

  test(
    "pinned toolkit#178 (K22): a host without fullscreen still gets a Fullscreen button, whose click stays local",
    { annotation: { type: "issue", description: TOOLKIT_HOST_CONTEXT_ISSUE } },
    async ({ page }) => {
      const app = await openView(page, { displayModes: ["inline"] })

      await expectProcessList(app)
      const fullscreen = app.getByRole("button", { name: "Fullscreen" })
      await expect(
        fullscreen,
        "toolkit#178 fixed? The affordance must be hidden when the host offers no fullscreen",
      ).toBeVisible()
      await fullscreen.click()
      await page.waitForTimeout(500)

      // mcp-use refuses the un-negotiated mode before it reaches the host;
      // the view stays inline and intact.
      expect((await hostLog(page)).displayModeRequests).toEqual([])
      await expect(fullscreen).toBeVisible()
      await expectProcessList(app)
    },
  )

  test("host with fullscreen: the toggle requests it and follows the host's switch", async ({
    page,
  }) => {
    const app = await openView(page, { displayModes: ["inline", "fullscreen"] })

    await expectProcessList(app)
    await app.getByRole("button", { name: "Fullscreen" }).click()

    await expect.poll(async () => (await hostLog(page)).displayModeRequests).toEqual(["fullscreen"])
    await expect(app.getByRole("button", { name: "Collapse" })).toBeVisible()
    await expectProcessList(app)
  })
})
