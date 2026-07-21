# Widget host simulation (`pnpm --filter @miragon-ai/mcp-server-camunda7 test:host`)

Playwright gate that loads the **built** widget bundle (`dist/mcp-app.html`)
in an iframe behind a minimal SEP-1865 (ext-apps) host shim and drives the
tool lifecycle over postMessage — no MCP server, no engines, no network.

Two scenarios (both must pass):

| Scenario | Host behaviour                                                      | Pass criterion                                                             |
| -------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `keep`   | tool-result WITH `structuredContent`                                | shell renders, **zero** `render-view` re-calls                             |
| `strip`  | claude.ai / Claude Desktop: tool-result WITHOUT `structuredContent` | shell recovers via **exactly one** `tools/call` re-execution, then renders |

The `strip` scenario is the acceptance gate for the widget-contract
recovery, which lives in `@miragon/mcp-toolkit-ui`'s
`useToolResultRecovery` (toolkit ≥ 0.8.0).

Run it:

```bash
pnpm --filter @miragon-ai/mcp-server-camunda7 exec playwright install chromium   # once
pnpm --filter @miragon-ai/mcp-server-camunda7 test:host                          # builds the UI, then tests
```

The fixture (`fixtures/view-result.json`) is a minimal but complete
`render-view` envelope (title + empty layout) — enough to prove the shell
leaves its loading skeleton, independent of any real widget's data contract.
Swap in a captured result from the inspector for a full-widget scenario.

Not part of `pnpm test` (needs the Vite bundle + a browser); run it for any
change to the widget shell, the toolkit pin, or `src/ui/main.tsx`.
