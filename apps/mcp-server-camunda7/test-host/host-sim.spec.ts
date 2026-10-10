import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test"
import { BROKEN_ENGINE, HEALTHY_ENGINE } from "./engines.js"

/**
 * Host-simulation gate for the built widget bundle (see test-host/README.md).
 *
 * Every scenario renders the view document the server ACTUALLY serves
 * (`resources/read` of `ui://views/<tool>.html` from the real `createApp`,
 * embedding `dist/mcp-app.{js,css}`) in a sandboxed srcdoc iframe, behind a
 * minimal SEP-1865 host whose tool calls go to that same server. The
 * rendering tool is a real camunda7 show tool against a stub engine (or the
 * framework's `render-view`), so the view receives the real envelope and
 * data shape.
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
/**
 * Long enough after the last lifecycle event (delivery, recovered render) for
 * a grace timer armed or RE-armed by it to fire — the window every
 * re-execution count must outlast, or a duplicate call lands after the check.
 */
const OUTLAST_GRACE_MS = RECOVERY_GRACE_MS + 1_000
const TOOLKIT_LIFECYCLE_ISSUE = "https://github.com/Miragon/mcp-toolkit/issues/176"
const TOOLKIT_HOST_CONTEXT_ISSUE = "https://github.com/Miragon/mcp-toolkit/issues/178"
const HOST_THEME_ISSUE = "https://github.com/Miragon/miragon-ai/issues/339"

interface HostLog {
  initializeRequested: boolean
  initialized: boolean
  delivered: "result" | "cancelled" | null
  originalResult: { isError?: boolean; content?: { type: string; text?: string }[] } | null
  toolCalls: { name: string; arguments: Record<string, unknown> }[]
  /** Calls the host answered with an error per `failTools`; `at` = host Date.now(). */
  failedToolCalls: { name: string; at: number }[]
  displayModeRequests: string[]
  sizeChanges: { width?: number; height?: number; at: number }[]
  methods: string[]
  errors: string[]
}

interface Scenario {
  /** The view-bound tool the "model" invoked (default: the process list). */
  tool?: string
  args?: Record<string, unknown>
  structuredContent?: "keep" | "strip"
  resultDelayMs?: number
  cancel?: boolean
  theme?: "light" | "dark"
  /** hostContext.locale (the host sim's default: en-US). */
  locale?: string
  /** The host's SEP-1865 `--font-sans` style variable. */
  fontSans?: string
  /** hostContext.containerDimensions.maxHeight. */
  maxHeight?: number
  displayModes?: string[]
  /** Answer `ui/initialize` this many ms late (a slow handshake). */
  initDelayMs?: number
  /** Answer the view's calls to these tools with an error (a server without them). */
  failTools?: string[]
}

async function openView(page: Page, scenario: Scenario = {}): Promise<FrameLocator> {
  const base = process.env.HOST_SIM_URL
  if (!base) throw new Error("HOST_SIM_URL is unset — run via `playwright test -c test-host`")
  const query = new URLSearchParams({
    tool: scenario.tool ?? RENDER_TOOL,
    args: JSON.stringify(scenario.args ?? { engine: HEALTHY_ENGINE }),
    structuredContent: scenario.structuredContent ?? "keep",
    resultDelayMs: String(scenario.resultDelayMs ?? 0),
    theme: scenario.theme ?? "light",
  })
  if (scenario.cancel) query.set("cancel", "1")
  if (scenario.locale) query.set("locale", scenario.locale)
  if (scenario.fontSans) query.set("fontSans", scenario.fontSans)
  if (scenario.maxHeight !== undefined) query.set("maxHeight", String(scenario.maxHeight))
  if (scenario.displayModes) query.set("displayModes", scenario.displayModes.join(","))
  if (scenario.initDelayMs) query.set("initDelayMs", String(scenario.initDelayMs))
  if (scenario.failTools) query.set("failTools", scenario.failTools.join(","))
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

function germanDefinitionsTable(app: FrameLocator): Locator {
  return app.getByRole("table", {
    name: "Bereitgestellte Prozessdefinitionen mit Version und Status",
  })
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

/** Relative luminance (0 = black, 1 = white) of an element's computed color property. */
async function luminance(
  locator: Locator,
  property: "color" | "backgroundColor" | "stroke" | "fill" = "color",
): Promise<number> {
  return await locator.evaluate((el, prop) => {
    // A canvas normalizes any CSS color syntax (oklch, color-mix …) to sRGB.
    const ctx = document.createElement("canvas").getContext("2d")!
    ctx.fillStyle = getComputedStyle(el)[prop]
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  }, property)
}

const textLuminance = (locator: Locator) => luminance(locator)

/** The document theme on every channel the CSS, the host and native controls read. */
async function documentTheme(app: FrameLocator) {
  return await app.locator("html").evaluate((html) => ({
    dark: html.classList.contains("dark"),
    dataTheme: html.getAttribute("data-theme"),
    colorScheme: getComputedStyle(html).colorScheme,
  }))
}

/** The last height the view reported to the host (bootstrapView's auto-resize). */
async function reportedHeight(page: Page): Promise<number> {
  return (await hostLog(page)).sizeChanges.at(-1)?.height ?? Number.NaN
}

/**
 * The height the view reported for what it renders NOW. bootstrapView's
 * auto-resize reports one frame after a resize (ResizeObserver → rAF →
 * postMessage), so right after the content became visible the last report can
 * still be an earlier state's — the ProfileGate skeleton's ~208 px, which
 * would satisfy any "small enough" bound by itself. Measure the document
 * exactly as the auto-resize does (`<html>` at max-content, rounded up) and
 * wait until the last report equals it.
 */
async function settledHeight(page: Page, app: FrameLocator): Promise<number> {
  const measured = () =>
    app.locator("html").evaluate((html) => {
      const saved = html.style.height
      html.style.height = "max-content"
      const height = Math.ceil(html.getBoundingClientRect().height)
      html.style.height = saved
      return height
    })
  let settled = Number.NaN
  await expect
    .poll(async () => {
      settled = await reportedHeight(page)
      return settled === (await measured())
    })
    .toBe(true)
  return settled
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
    // (its inline view config), sandboxed to an opaque origin, under the
    // host's CSP — the first element of <head>, ahead of every script.
    expect(
      await app.locator("html").evaluate(() => ({
        viewConfig: "__mcpUseViewConfig" in globalThis,
        origin: window.origin,
        csp: document.head.firstElementChild?.getAttribute("http-equiv") ?? null,
      })),
    ).toEqual({ viewConfig: true, origin: "null", csp: "Content-Security-Policy" })
    await waitForDelivery(page, "result")
    // Outlast the recovery grace timer: a conforming host must never trigger it.
    await page.waitForTimeout(OUTLAST_GRACE_MS)

    const log = await hostLog(page)
    expect(await reExecutions(page)).toHaveLength(0)
    // The provider stack works in the real bundle: ProfileGate fetched the
    // profile through the host bridge (AppShellProviders order) …
    expect(log.toolCalls.map((c) => c.name)).toContain(PROFILE_FEED)
    // … and bootstrapView's auto-resize reports the rendered height to the host.
    expect(await settledHeight(page, app)).toBeGreaterThan(200)
    expect(log.errors).toEqual([])
    // Nothing the served document needs is blocked by its own declared CSP,
    // and nothing throws …
    expect(errors).toEqual([])
    // … and that CSP is in force, so the empty list measured something: a
    // load it does not allow is refused (and logged — after the check above).
    expect(
      await app.locator("html").evaluate(
        () =>
          new Promise<string | null>((resolve) => {
            document.addEventListener(
              "securitypolicyviolation",
              (event) => resolve(event.effectiveDirective),
              { once: true },
            )
            new Image().src = "https://csp-probe.invalid/pixel.png"
            setTimeout(() => resolve(null), 2_000)
          }),
      ),
    ).toBe("img-src")
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
    // The recovered render is the last event: a grace timer re-armed by the
    // recovered payload would fire a second call inside this window.
    await page.waitForTimeout(OUTLAST_GRACE_MS)
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
      // The host's late delivery is the last event; outlast a timer it re-arms.
      await page.waitForTimeout(OUTLAST_GRACE_MS)

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
      // The recovery fires one grace period in; outlast a second one, so a
      // timer re-armed by the recovered (error) result would show.
      await page.waitForTimeout(RECOVERY_GRACE_MS + OUTLAST_GRACE_MS)

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
    await page.waitForTimeout(OUTLAST_GRACE_MS)
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
    "dark host on a light OS: the host theme wins on every channel (#339, K41)",
    { annotation: { type: "issue", description: HOST_THEME_ISSUE } },
    async ({ page }, testInfo) => {
      const app = await openView(page, { theme: "dark" })

      await expectProcessList(app)
      await testInfo.attach("dark-host-light-os", {
        body: await page.screenshot(),
        contentType: "image/png",
      })
      // One effective theme drives the tokens (`.dark`), what the host reads
      // (`data-theme`) and native controls (`color-scheme`) …
      expect(await documentTheme(app)).toEqual({
        dark: true,
        dataTheme: "dark",
        colorScheme: "dark",
      })
      // … so the text is light on the host's dark canvas, the toolbar included.
      expect(await textLuminance(definitionsTable(app).getByRole("row").nth(2))).toBeGreaterThan(
        0.5,
      )
      expect(
        await textLuminance(app.getByRole("heading", { name: "Process Definitions" }).first()),
      ).toBeGreaterThan(0.5)
    },
  )

  test("light host on a dark OS: the host theme wins the other way too", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    const app = await openView(page, { theme: "light" })

    await expectProcessList(app)
    expect(await documentTheme(app)).toEqual({
      dark: false,
      dataTheme: "light",
      colorScheme: "light",
    })
    expect(await textLuminance(definitionsTable(app).getByRole("row").nth(2))).toBeLessThan(0.5)
  })

  test(
    "host without fullscreen: no Fullscreen button (shell override until toolkit#178, K22)",
    { annotation: { type: "issue", description: TOOLKIT_HOST_CONTEXT_ISSUE } },
    async ({ page }) => {
      for (const displayModes of [["inline"], undefined]) {
        const app = await openView(page, { displayModes })

        await expectProcessList(app)
        // The rest of the toolbar stays.
        await expect(
          app.getByRole("heading", { name: "Process Definitions" }).first(),
        ).toBeVisible()
        await expect(app.getByRole("button", { name: "Fullscreen" })).toBeHidden()
        expect((await hostLog(page)).displayModeRequests).toEqual([])
      }
    },
  )

  test("host locale de-DE without a saved profile: a German view (#339)", async ({ page }) => {
    // The default deployment has no OAuth, so the profile is the default
    // `language: "system"` — the host's locale decides.
    const app = await openView(page, { locale: "de-DE", displayModes: ["inline", "fullscreen"] })

    const table = germanDefinitionsTable(app)
    await expect(table).toBeVisible({ timeout: 15_000 })
    await expect(table.getByRole("row")).toHaveCount(4)
    await expect(app.getByText("3 bereitgestellt")).toBeVisible()
    // The view chrome (toolkit McpAppView) follows the same locale.
    await expect(app.getByRole("button", { name: "Vollbild" })).toBeVisible()
    expect(await app.locator("html").getAttribute("lang")).toBe("de")
  })

  test("a profile feed the server lacks (e.g. an analytics-only boot): the view paints at its first failure, from the host context (#339)", async ({
    page,
  }) => {
    const app = await openView(page, { failTools: [PROFILE_FEED], theme: "dark", locale: "de-DE" })

    // The host's locale and theme — the gate fell back to the host context …
    await expect(germanDefinitionsTable(app).getByRole("row")).toHaveCount(4, { timeout: 15_000 })
    expect(await documentTheme(app)).toEqual({ dark: true, dataTheme: "dark", colorScheme: "dark" })
    // … at the failure itself: the content's size report precedes react-query's
    // first retry (1 s after it). Waiting out the gate's 1.5 s bound, or the
    // ~7 s of retries, would report it only after that retry.
    const painted = await settledHeight(page, app)
    await expect.poll(async () => (await hostLog(page)).failedToolCalls.length).toBeGreaterThan(1)
    const log = await hostLog(page)
    const [failure, retry] = log.failedToolCalls
    expect(failure.name).toBe(PROFILE_FEED)
    const contentAt = log.sizeChanges.find((s) => s.height === painted)?.at ?? Infinity
    expect(contentAt, "the view waited for the profile's retries").toBeLessThan(retry.at)
  })

  test("a slow handshake: nothing paints before the host context arrives — no English or OS-theme flash (#339)", async ({
    page,
  }) => {
    const app = await openView(page, { initDelayMs: 3_000, theme: "dark", locale: "de-DE" })

    await expect.poll(async () => (await hostLog(page)).initializeRequested).toBe(true)
    // Past the profile's 1.5 s wait, the host has not answered yet: the gate
    // times the profile from the CONNECTION, so the shell's document layer is
    // still empty instead of painting English on the OS theme, to flip a
    // moment later.
    await page.waitForTimeout(2_000)
    const documentLayer = await app.locator("#root").evaluate((root) => ({
      children: root.firstElementChild?.childElementCount,
      text: root.textContent,
    }))
    expect(documentLayer).toEqual({ children: 0, text: "" })
    // Once the host answers: the German view on the host's dark theme.
    await expect(germanDefinitionsTable(app).getByRole("row")).toHaveCount(4, { timeout: 15_000 })
    expect(await documentTheme(app)).toEqual({ dark: true, dataTheme: "dark", colorScheme: "dark" })
  })

  test("host font: text renders in the host's --font-sans, font-mono stays monospace", async ({
    page,
  }) => {
    const app = await openView(page, { fontSans: '"Host Sim Sans", serif' })

    await expectProcessList(app)
    const fonts = await app.locator("body").evaluate((body) => {
      const mono = document.createElement("code")
      mono.className = "font-mono"
      mono.textContent = "a1b2c3"
      body.appendChild(mono)
      const result = {
        body: getComputedStyle(body).fontFamily,
        mono: getComputedStyle(mono).fontFamily,
      }
      mono.remove()
      return result
    })
    expect(fonts.body).toContain("Host Sim Sans")
    expect(fonts.body).not.toContain("Geist")
    expect(fonts.mono).toMatch(/monospace/)
  })

  test("the served stylesheet forces no font and sets no height floor (#339)", async ({ page }) => {
    const app = await openView(page)
    await expectProcessList(app)

    const css = await app
      .locator("html")
      .evaluate(() => [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n"))
    expect(css).not.toMatch(/font-family:[^;}]*!important/)
    expect(css).not.toMatch(/Geist|data:font\/woff2/)
    expect(css).not.toMatch(/min-height:\s*600px/)
  })

  test("a host height budget: the view scrolls inside it instead of reporting more", async ({
    page,
  }) => {
    const app = await openView(page, { maxHeight: 220 })

    await expectProcessList(app)
    // The shell's document layer is the scroll container, capped at the budget.
    const container = await app.locator("#root").evaluate((root) => {
      const el = root.firstElementChild as HTMLElement
      return {
        maxHeight: getComputedStyle(el).maxHeight,
        scrolls: el.scrollHeight > el.clientHeight,
        height: el.getBoundingClientRect().height,
      }
    })
    expect(container).toMatchObject({ maxHeight: "220px", scrolls: true })
    // The report belongs to the capped list — at least the container — and
    // stays inside the budget.
    const reported = await settledHeight(page, app)
    expect(reported).toBeGreaterThanOrEqual(Math.floor(container.height))
    expect(reported).toBeLessThanOrEqual(220)
  })

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

test.describe("real BPMN view (camunda7_show_bpmn_viewer)", () => {
  test("dark host: a light canvas keeps flows and labels readable, the logo clear of the zoom controls (#339, N122/N129)", async ({
    page,
  }, testInfo) => {
    const app = await openView(page, {
      tool: "camunda7_show_bpmn_viewer",
      args: { engine: HEALTHY_ENGINE, processDefinitionKey: "invoice" },
      theme: "dark",
    })

    const canvas = app.getByRole("img", { name: "BPMN process diagram" })
    // Four sequence flows of the fixture diagram rendered.
    await expect(canvas.locator(".djs-connection")).toHaveCount(4, { timeout: 15_000 })
    await testInfo.attach("bpmn-dark-host", {
      body: await page.screenshot(),
      contentType: "image/png",
    })
    expect((await documentTheme(app)).dark).toBe(true)

    // The canvas is light in a dark theme; bpmn-js's near-black strokes and
    // labels sit on it, not on the dark card.
    expect(await luminance(canvas, "backgroundColor")).toBeGreaterThan(0.95)
    expect(await luminance(canvas.locator(".djs-connection path").first(), "stroke")).toBeLessThan(
      0.25,
    )
    expect(
      await luminance(canvas.locator("text.djs-label").first(), "fill"),
      "external labels (events, gateway, flow names) must stay dark on the light canvas",
    ).toBeLessThan(0.25)

    // The bpmn.io logo stays (a bpmn-js licence term) but no longer covers a
    // zoom button: a click on each button's centre reaches the button.
    const logo = app.locator(".bjs-powered-by")
    await expect(logo).toBeVisible()
    for (const name of ["Zoom in", "Fit to viewport", "Zoom out"]) {
      const button = app.getByRole("button", { name })
      const hit = await button.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return top !== null && el.contains(top)
      })
      expect(hit, `${name} is covered`).toBe(true)
    }
  })
})

test.describe("framework view (render-view)", () => {
  test("an inline KPI view sizes to its content — far below the old 600 px floor (#339, K40)", async ({
    page,
  }) => {
    const app = await openView(page, {
      tool: "render-view",
      args: {
        title: "Throughput",
        keys: { "sim:kpis": { Running: 12, Incidents: 0, "Jobs due": 3 } },
        layout: [{ row: [{ widget: "shell:kpi-grid", props: { dataKey: "sim:kpis" } }] }],
      },
    })

    await expect(app.getByText("Jobs due")).toBeVisible({ timeout: 15_000 })
    // Toolbar + one KPI strip: ~130 px — below even the gate skeleton's
    // ~208 px, so the settled report is the view's own. The old
    // html/body/#root floor reported 600 for every view.
    const reported = await settledHeight(page, app)
    expect(reported).toBeLessThan(200)
    expect(reported).toBeGreaterThan(60)
  })
})
