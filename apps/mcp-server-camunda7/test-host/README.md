# Widget host simulation (`pnpm --filter @miragon-ai/mcp-server-camunda7 test:host`)

Playwright gate for the **built** widget bundle, run in CI as "Widget host
simulation (test:host)". It renders exactly what an MCP Apps host renders:

- `global-setup.ts` boots the real composition root (`createApp` from
  `src/app.ts`, default read-only deployment — plus a `camunda7:operations`
  one for the write scenario) serving `dist/mcp-app.{js,css}`, a CIB Seven
  REST stub (`stub-engine.ts`, `fixtures/process-definitions.json` plus the
  `invoice` diagram `fixtures/invoice.bpmn`, one failed job) and the host's
  server side (`host-backend.ts`, a real MCP client) — all on ephemeral
  loopback ports. A scenario can hold the stub's answers to one search term
  and release them later (`POST /__control/hold|release?nameLike=<term>` at
  `HOST_SIM_ENGINE_URL`), so an in-flight state is asserted without a timing
  window.
- `host-sim.html` is a minimal SEP-1865 host. It reads the view resource
  (`resources/read` of `ui://views/<tool>.html` — mcp-use's synthesized inline
  document), renders it as `srcdoc` in a `sandbox="allow-scripts"` iframe
  under the CSP built from the resource's `_meta.ui.csp`, answers
  `ui/initialize`, and proxies every `tools/call` the view makes to the server.
- The rendering tool is the real `camunda7_show_process_list` against the
  stub (the BPMN scenario: `camunda7_show_bpmn_viewer`; the KPI one: the
  framework's `render-view` with a `shell:kpi-grid`; the write one:
  `camunda7_show_job_panel` on the operations deployment), so the view gets the
  server's real envelope and data shape.

| Scenario                   | Host behaviour                                    | Pass criterion                                                                 |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| keep                       | result WITH `structuredContent`                   | real table renders, **zero** re-executions, no console error, size reported    |
| in-widget query            | user types; the stub holds the search's answer    | feed refetches + filters (`dedupe`); in flight: focus kept, rows dimmed        |
| strip                      | result WITHOUT `structuredContent` (claude.ai)    | **exactly one** re-execution with the invocation's arguments, then renders     |
| slow tool (pinned)         | result 4 s after `initialized`                    | renders once; today **one** redundant re-execution (toolkit#176, K13)          |
| `isError` (pinned)         | real engine 503 through the server                | today one re-execution + endless skeleton (toolkit#176, K14)                   |
| cancel                     | `ui/notifications/tool-cancelled`                 | cancellation text, **zero** re-executions                                      |
| dark host + dark OS        | `theme: "dark"`, OS dark                          | dark tokens (control for the scenario below)                                   |
| dark host + light OS       | `theme: "dark"`, OS light                         | the host wins: `.dark`, `data-theme`, `color-scheme` dark, light text (#339)   |
| light host + dark OS       | `theme: "light"`, OS dark                         | the host wins the other way: all three light, dark text                        |
| no fullscreen              | `availableDisplayModes` `["inline"]` / absent     | no Fullscreen button (shell override until toolkit#178, K22), no request       |
| host locale `de-DE`        | `locale: "de-DE"`, no saved profile               | German widget and chrome strings, `<html lang="de">` (#339)                    |
| profile feed missing       | `failTools`: the profile feed answers an error    | German, dark view from the host context, painted before the feed's first retry |
| slow handshake             | `initDelayMs: 3000`                               | nothing painted before `ui/initialize` is answered, then the German, dark view |
| host font                  | `styles.variables["--font-sans"]`                 | body text in the host's font, `font-mono` stays monospace                      |
| served stylesheet          | —                                                 | no `font-family … !important`, no inlined font, no 600 px floor                |
| height budget              | `containerDimensions.maxHeight: 220`              | settled report ≤ 220 and ≥ the capped container, the shell scrolls inside it   |
| inline KPI view            | `render-view` with `shell:kpi-grid`               | settled report < 200 px — sized to content (K40), not the gate skeleton's      |
| fullscreen                 | `availableDisplayModes: ["inline", "fullscreen"]` | the toggle requests fullscreen and follows the host's switch                   |
| BPMN on a dark host        | `camunda7_show_bpmn_viewer`, `theme: "dark"`      | light canvas, dark flows/labels, every zoom button clickable past the logo     |
| write refresh (operations) | `camunda7_show_job_panel`, user clicks Retry      | the retry refetches the seeded feed and re-renders, **zero** re-executions     |
| cockpit on an engine       | `camunda7_open_cockpit` with `engine`             | opens on that engine (sidebar switcher), not on the engine picker              |
| cockpit picker             | `camunda7_open_cockpit` without `engine`          | the engine picker (two engines, no saved default)                              |

Height checks read the **settled** report — the one equal to the document's current
max-content height — since the ProfileGate skeleton's earlier report (~208 px) can
still be the last one when the content is already visible.

**Pinned scenarios** assert the CURRENT behaviour of a known defect outside
this repo's fix scope. They fail on purpose once the fix lands — flip them to
the expected behaviour named in their assertion message.

Run it (after `pnpm build` — the server imports the workspace packages' dist):

```bash
pnpm --filter @miragon-ai/mcp-server-camunda7 exec playwright install chromium   # once
pnpm --filter @miragon-ai/mcp-server-camunda7 test:host                          # builds the UI, then tests
```

Not part of `pnpm test` (needs the Vite bundle and a browser). Run it locally for
any change to the widget shell, `src/ui/`, the toolkit or mcp-use pins. Failed
scenarios leave a trace and a screenshot in `apps/mcp-server-camunda7/test-results/`
(`pnpm exec playwright show-trace <zip>`).
