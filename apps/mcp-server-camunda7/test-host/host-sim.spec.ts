import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test"
import { BROKEN_ENGINE, ENGINE_CONTROL_ENV, HEALTHY_ENGINE } from "./engines.js"

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
/** The toolkit's English view chrome (its en catalog, toolkit 2.8). */
const CHROME = {
  loading: "Loading view…",
  cancelled: "Cancelled. Ask in the chat to open this view again.",
  errorTitle: "This view couldn't be loaded",
  retry: "Try again",
  enterFullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  /** The quiet line over a payload the view loaded itself ("Reloaded at 2:32 PM"). */
  reloadedAt: /^Reloaded at \d{1,2}:\d{2}/,
}

/**
 * The Miragon corporate-design tokens as the toolkit vendors them
 * (`--cd-blau: #335DE5` …), colour values only — the drift guard's
 * reference for what the BUILT stylesheet must carry.
 */
function vendoredColourTokens(): [string, string][] {
  const require = createRequire(import.meta.url)
  const css = readFileSync(
    require.resolve("@miragon/mcp-toolkit-ui/cd-tokens.generated.css"),
    "utf8",
  )
  return [...css.matchAll(/(--cd-[\w-]+):\s*(#[0-9a-fA-F]{3,8});/g)].map(([, name, value]) => [
    name,
    value,
  ])
}

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
  /** The view-bound tool the "model" invoked (default: {@link RENDER_TOOL}). */
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

/**
 * The stub engine's scenario control (stub-engine.ts): `hold` makes its
 * answers to the search `term` wait, `release` sends them.
 */
async function engineControl(action: "hold" | "release", term: string): Promise<void> {
  const base = process.env[ENGINE_CONTROL_ENV]
  if (!base)
    throw new Error(`${ENGINE_CONTROL_ENV} is unset — run via \`playwright test -c test-host\``)
  const query = new URLSearchParams({ nameLike: term })
  const res = await fetch(`${base}/__control/${action}?${query.toString()}`, { method: "POST" })
  expect(res.ok, `stub engine ${action} "${term}"`).toBe(true)
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
    // The layout is the server's single-widget layout, not an empty one. The
    // profile follows the host's locale ("system"), which only the view sees,
    // so the server sets no toolbar title (#322 U3): the widget's own heading
    // is the view's one title, never under an English toolbar title.
    await expect(
      app.getByRole("heading", { name: "Process definitions", exact: true }),
    ).toHaveCount(1)
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
    // The chat's own answer carries no "Reloaded at" line.
    await expect(app.getByText(CHROME.reloadedAt)).toHaveCount(0)
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

    const search = app.getByPlaceholder("Filter by name…")
    const table = definitionsTable(app)
    // The stub engine holds its answer to this search until the in-flight
    // state has been looked at — no timing window to race.
    await engineControl("hold", "invoice")
    try {
      await search.fill("invoice")

      // While the search is in flight the list stays mounted with the
      // previous rows, and the operator keeps typing into the same, still
      // focused box (#341 N123) …
      const searched = async () =>
        (await hostLog(page)).toolCalls.some(
          (c) => c.name === "camunda7_process_list_data" && c.arguments.nameLike === "invoice",
        )
      await expect.poll(searched, { timeout: 15_000 }).toBe(true)
      await expect(search).toBeFocused()
      await expect(search).toHaveValue("invoice")
      await expect(table.getByRole("row")).toHaveCount(4)
      // … and SHOWS that they are not its answer yet: the rows are marked (an
      // info bar, no dimming) and busy, "Updating…" is visible, and no
      // "Showing 3 of 3" sits beside the new search.
      await expect(app.locator("[data-stale]")).toHaveAttribute("aria-busy", "true")
      await expect(app.locator('[data-stale] > [data-tone="info"]')).toHaveCount(1)
      await expect(app.getByText("Updating…")).toBeVisible()
      await expect(app.getByText(/Showing \d+ of/)).toHaveCount(0)
    } finally {
      await engineControl("release", "invoice")
    }

    await expect(table.getByRole("row")).toHaveCount(2)
    await expect(table.getByRole("row").nth(1)).toContainText("Invoice Receipt")
    await expect(app.locator("[data-stale]")).toHaveCount(0)
    await expect(app.getByText("Showing 1 of 1 definitions")).toBeVisible()
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
    // The view loaded these figures itself, so they can differ from the
    // chat's answer: the toolkit's "Reloaded at" line says so (2.8), also with
    // the toolbar title hidden.
    await expect(app.getByText(CHROME.reloadedAt)).toBeVisible()
    // The recovered render is the last event: a grace timer re-armed by the
    // recovered payload would fire a second call inside this window.
    await page.waitForTimeout(OUTLAST_GRACE_MS)
    expect(await reExecutions(page)).toEqual([
      { name: RENDER_TOOL, arguments: { engine: HEALTHY_ENGINE } },
    ])
  })

  test(
    "a slow tool on a compliant host is never re-executed: the view waits for the host's result (toolkit#176 K13, fixed in 2.8)",
    { annotation: { type: "issue", description: TOOLKIT_LIFECYCLE_ISSUE } },
    async ({ page }) => {
      const app = await openView(page, { resultDelayMs: RECOVERY_GRACE_MS + 1_500 })

      // Past the old grace timer, the host is still running the tool: the
      // view keeps waiting (the toolkit's observer saw no stripped result)
      // instead of loading the view itself.
      await expect(app.getByText(CHROME.loading)).toBeVisible({ timeout: 15_000 })
      await page.waitForTimeout(RECOVERY_GRACE_MS + 500)
      expect((await hostLog(page)).delivered).toBeNull()
      expect(await reExecutions(page)).toHaveLength(0)
      await expect(definitionsTable(app)).toHaveCount(0)

      // Rendered from the host's late delivery, once.
      await waitForDelivery(page, "result")
      await expectProcessList(app)
      // The delivery is the last event; outlast a timer it could re-arm.
      await page.waitForTimeout(OUTLAST_GRACE_MS)
      await expect(definitionsTable(app)).toHaveCount(1)
      expect(await reExecutions(page)).toHaveLength(0)
      // The host's own answer: no "Reloaded at" line, which marks a payload
      // the view loaded itself.
      await expect(app.getByText(CHROME.reloadedAt)).toHaveCount(0)
    },
  )

  test(
    "a tool error is never re-executed: the error state with a retry replaces the skeleton (toolkit#176 K14, fixed in 2.7)",
    { annotation: { type: "issue", description: TOOLKIT_LIFECYCLE_ISSUE } },
    async ({ page }) => {
      const app = await openView(page, { args: { engine: BROKEN_ENGINE } })

      await waitForDelivery(page, "result")
      const log = await hostLog(page)
      // A genuine isError result from the real server (engine 503).
      expect(log.originalResult?.isError).toBe(true)
      // Outlast the recovery grace twice over: a recovery that still fired on
      // an error result (the 2.6 behaviour) would show as a re-execution.
      await page.waitForTimeout(RECOVERY_GRACE_MS + OUTLAST_GRACE_MS)

      expect(await reExecutions(page)).toHaveLength(0)
      await expect(app.getByRole("heading", { name: CHROME.errorTitle })).toBeVisible()
      await expect(app.getByText("Loading view…")).toHaveCount(0)
      await expect(definitionsTable(app)).toHaveCount(0)

      // The retry is the user's: one call with the invocation's arguments, and
      // the engine still down brings the error state back, not a skeleton.
      await app.getByRole("button", { name: CHROME.retry }).click()
      await expect
        .poll(() => reExecutions(page))
        .toEqual([{ name: RENDER_TOOL, arguments: { engine: BROKEN_ENGINE } }])
      await expect(app.getByRole("heading", { name: CHROME.errorTitle })).toBeVisible()
      await page.waitForTimeout(OUTLAST_GRACE_MS)
      expect(await reExecutions(page)).toHaveLength(1)
    },
  )

  test("cancelled call: shows the cancellation and never re-executes", async ({ page }) => {
    const app = await openView(page, { cancel: true })

    await waitForDelivery(page, "cancelled")
    await expect(app.getByText(CHROME.cancelled)).toBeVisible()
    await page.waitForTimeout(OUTLAST_GRACE_MS)
    expect(await reExecutions(page)).toHaveLength(0)
    await expect(app.getByText(CHROME.cancelled)).toBeVisible()
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
      // … so the text is light on the host's dark canvas, the view's title included.
      expect(await textLuminance(definitionsTable(app).getByRole("row").nth(2))).toBeGreaterThan(
        0.5,
      )
      expect(
        await textLuminance(app.getByRole("heading", { name: "Process definitions" }).first()),
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
    "host without fullscreen: no Fullscreen button (the toolkit gates it on availableDisplayModes, toolkit#178 K22)",
    { annotation: { type: "issue", description: TOOLKIT_HOST_CONTEXT_ISSUE } },
    async ({ page }) => {
      for (const displayModes of [["inline"], undefined]) {
        const app = await openView(page, { displayModes })

        await expectProcessList(app)
        // The view itself stays.
        await expect(
          app.getByRole("heading", { name: "Process definitions" }).first(),
        ).toBeVisible()
        await expect(app.getByRole("button", { name: CHROME.enterFullscreen })).toHaveCount(0)
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
    // One German title and no English toolbar title over it: the server
    // titles a view only in a language the profile names (#322 U3).
    await expect(
      app.getByRole("heading", { name: "Prozessdefinitionen", exact: true }),
    ).toHaveCount(1)
    await expect(app.getByRole("heading", { name: /Process definitions/i })).toHaveCount(0)
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

  test("host font: Geist first, then the host's --font-sans; Geist is not loaded, so the host's font renders", async ({
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
        // The host's value moved off the role name (adoptHostFontVariables).
        roleInline: document.documentElement.style.getPropertyValue("--font-sans"),
        hostSlot: document.documentElement.style.getPropertyValue("--host-font-sans"),
        geistFaces: [...document.fonts].filter((f) => /Geist/i.test(f.family)).length,
      }
      mono.remove()
      return result
    })
    // The Miragon stack: Geist, then the host's font in the fallback slot,
    // then the system — the host no longer replaces the whole stack …
    expect(fonts.roleInline).toBe("")
    expect(fonts.hostSlot).toBe('"Host Sim Sans", serif')
    expect(fonts.body).toMatch(/^"?Geist"?,/)
    expect(fonts.body.indexOf("Host Sim Sans")).toBeGreaterThan(fonts.body.indexOf("Geist"))
    // … and no Geist face ships with the view (served by URL in a later
    // step), so the host's font is what renders.
    expect(fonts.geistFaces).toBe(0)
    expect(fonts.mono).toMatch(/monospace/)
  })

  test("the served stylesheet inlines no font, sets no height floor and carries the vendored tokens (#339)", async ({
    page,
  }) => {
    const app = await openView(page)
    await expectProcessList(app)

    const css = await app
      .locator("html")
      .evaluate(() => [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n"))
    expect(css).not.toMatch(/font-family:[^;}]*!important/)
    expect(css).not.toMatch(/@font-face|data:font\/woff2/)
    expect(css).not.toMatch(/min-height:\s*600px/)

    // Drift guard on the BUILT bundle: every Miragon colour token resolves to
    // the value the toolkit vendors (normalized by a canvas, so a minified
    // `#fff` equals `#FFFFFF`) — no fork, no stale copy.
    const tokens = vendoredColourTokens()
    expect(tokens.length).toBeGreaterThan(15)
    const drift = await app.locator("html").evaluate((html, expected) => {
      const ctx = document.createElement("canvas").getContext("2d")!
      const normalize = (colour: string) => {
        ctx.fillStyle = "#000000"
        ctx.fillStyle = colour.trim()
        return ctx.fillStyle
      }
      const style = getComputedStyle(html)
      return expected
        .filter(([name, value]) => normalize(style.getPropertyValue(name)) !== normalize(value))
        .map(([name]) => name)
    }, tokens)
    expect(drift).toEqual([])
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
    await app.getByRole("button", { name: CHROME.enterFullscreen }).click()

    await expect.poll(async () => (await hostLog(page)).displayModeRequests).toEqual(["fullscreen"])
    await expect(app.getByRole("button", { name: CHROME.exitFullscreen })).toBeVisible()
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

/**
 * The kit's design-system foundation in the BUILT bundle (#322): the Miragon
 * role variables reach the view (the toolkit theme survived Tailwind), Lucide
 * icons draw at the CI stroke through lucide-react's own strokeWidth — never a
 * CSS rule — (2.5; 2 in dense rows and the toolkit's toolbar, whose
 * LucideProvider sets it), and a KPI's state is a tinted, edged card around
 * neutral digits — never a coloured number.
 */
test.describe("kit foundation (camunda7_show_job_panel)", () => {
  test("role variables, Lucide strokes and the tone model reach the rendered view", async ({
    page,
  }) => {
    const app = await openView(page, {
      tool: "camunda7_show_job_panel",
      displayModes: ["inline", "fullscreen"],
    })
    const handOff = app.getByRole("button", { name: "Assess in chat" })
    await expect(handOff).toBeVisible({ timeout: 15_000 })

    const roles = await app.locator("html").evaluate((el) => {
      const style = getComputedStyle(el)
      return [
        "--danger-ink",
        "--warning-ink",
        "--success-ink",
        "--info-ink",
        "--link",
        "--focus",
        "--primary-hover",
        "--scrim",
      ].map((name) => style.getPropertyValue(name).trim())
    })
    for (const value of roles) expect(value).not.toBe("")
    // The Miragon brand, not the shadcn neutrals: links in --cd-blau-link.
    const link = await app.locator("html").evaluate((el) => {
      const ctx = document.createElement("canvas").getContext("2d")!
      ctx.fillStyle = getComputedStyle(el).getPropertyValue("--link").trim()
      return ctx.fillStyle
    })
    expect(link).toBe("#2b50d4")

    const stroke = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).strokeWidth)
    expect(await stroke(handOff.locator("svg.lucide"))).toBe("2.5px")
    const rowHandOffs = app.locator("td button svg.lucide")
    expect(await rowHandOffs.count()).toBeGreaterThan(0)
    expect(await stroke(rowHandOffs.first())).toBe("2px")
    expect(await stroke(app.locator("svg.lucide-maximize-2"))).toBe("2px")
    // No glyph icon anywhere in the view.
    expect(await app.locator("body").innerText()).not.toMatch(/[✦⊡▦↗›⚠⚙⏱⤧▶✓✕▤⊞↻]/)

    const blocked = app.locator('[data-tone="danger"]').first()
    await expect(blocked).toBeVisible()
    const card = await blocked.evaluate((el) => {
      const style = getComputedStyle(el)
      const digits = getComputedStyle(el.querySelector(".text-2xl")!)
      const page = getComputedStyle(document.body)
      return {
        edge: style.borderTopColor,
        tint: style.backgroundColor,
        pageBackground: page.backgroundColor,
        digits: digits.color,
        foreground: page.color,
      }
    })
    expect(card.edge).not.toBe("rgba(0, 0, 0, 0)")
    expect(card.edge).not.toBe(card.foreground)
    expect(card.tint, "the state is the card's tint").not.toBe(card.pageBackground)
    expect(card.digits, "a KPI number stays neutral").toBe(card.foreground)
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
    // A composed view's one title is the toolbar's (titleMode "show"); a
    // module view's is its widget heading (titleMode "hide", unit-tested).
    await expect(app.getByRole("heading", { name: "Throughput" })).toHaveCount(1)
    // Toolbar + one KPI strip: ~130 px — below even the gate skeleton's
    // ~208 px, so the settled report is the view's own. The old
    // html/body/#root floor reported 600 for every view.
    const reported = await settledHeight(page, app)
    expect(reported).toBeLessThan(200)
    expect(reported).toBeGreaterThan(60)
  })
})

/**
 * The cockpit opens where `camunda7_open_cockpit` resolved (#341 K43): this
 * deployment has two engines, so without an `engine` the user picks one; with
 * one, the cockpit is already on it — the engine the summary told the model.
 */
test.describe("cockpit (camunda7_open_cockpit)", () => {
  test("opens on the `engine` argument, not on the picker", async ({ page }) => {
    const app = await openView(page, {
      tool: "camunda7_open_cockpit",
      args: { engine: HEALTHY_ENGINE },
    })
    await expect(app.getByLabel("Selected engine")).toHaveValue(HEALTHY_ENGINE, { timeout: 15_000 })
    await expect(app.getByRole("navigation", { name: "Cockpit sections" })).toBeVisible()
    await expect(app.getByText("Work with one engine", { exact: true })).toHaveCount(0)
  })

  test("without one, shows the engine picker", async ({ page }) => {
    const app = await openView(page, { tool: "camunda7_open_cockpit", args: {} })
    await expect(app.getByText("Work with one engine", { exact: true })).toBeVisible({
      timeout: 15_000,
    })
    await expect(app.getByLabel("Selected engine")).toHaveCount(0)
  })
})
