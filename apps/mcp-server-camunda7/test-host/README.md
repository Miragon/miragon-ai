# Widget host simulation (`pnpm --filter @miragon-ai/mcp-server-camunda7 test:host`)

Playwright gate for the **built** widget bundle, run in CI as "Widget host
simulation (test:host)". It renders exactly what an MCP Apps host renders:

- `global-setup.ts` boots the real composition root (`createApp` from
  `src/app.ts`, default read-only deployment) serving `dist/mcp-app.{js,css}`,
  a CIB Seven REST stub (`stub-engine.ts`, `fixtures/process-definitions.json`)
  and the host's server side (`host-backend.ts`, a real MCP client) — all on
  ephemeral loopback ports.
- `host-sim.html` is a minimal SEP-1865 host. It reads the view resource
  (`resources/read` of `ui://views/<tool>.html` — mcp-use's synthesized inline
  document), renders it as `srcdoc` in a `sandbox="allow-scripts"` iframe
  under the CSP built from the resource's `_meta.ui.csp`, answers
  `ui/initialize`, and proxies every `tools/call` the view makes to the server.
- The rendering tool is the real `camunda7_show_process_list` against the
  stub, so the view gets the server's real envelope and data shape.

| Scenario                      | Host behaviour                                    | Pass criterion                                                                |
| ----------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| keep                          | result WITH `structuredContent`                   | real table renders, **zero** re-executions, no console error, size reported   |
| in-widget query               | user types into the search                        | the widget's own feed call refetches and filters (guards the vite `dedupe`)   |
| strip                         | result WITHOUT `structuredContent` (claude.ai)    | **exactly one** re-execution with the invocation's arguments, then renders    |
| slow tool (pinned)            | result 4 s after `initialized`                    | renders once; today **one** redundant re-execution (toolkit#176, K13)         |
| `isError` (pinned)            | real engine 503 through the server                | today one re-execution + endless skeleton (toolkit#176, K14)                  |
| cancel                        | `ui/notifications/tool-cancelled`                 | cancellation text, **zero** re-executions                                     |
| dark host + dark OS           | `theme: "dark"`, OS dark                          | dark tokens (control for the pin below)                                       |
| dark host + light OS (pinned) | `theme: "dark"`, OS light                         | today light tokens on the dark canvas (#339, K41) — the host theme should win |
| no fullscreen (pinned)        | `availableDisplayModes: ["inline"]`               | button still shown (toolkit#178, K22); the click never reaches the host       |
| fullscreen                    | `availableDisplayModes: ["inline", "fullscreen"]` | the toggle requests fullscreen and follows the host's switch                  |

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
