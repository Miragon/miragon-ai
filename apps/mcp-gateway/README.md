# @miragon-ai/mcp-gateway

The MCP host for [Miragon AI](../../README.md). It composes the `camunda7` and `analytics` modules
into a single [mcp-use](https://github.com/mcp-use/mcp-use) server, bundles every React widget into a
single-file HTML resource, and serves the streamable-HTTP MCP transport on port `8400`.

This is the deployable artifact: it ships as the Docker image
[`miragon/miragon-ai-server`](https://hub.docker.com/r/miragon/miragon-ai-server). The package itself
is `private` and not published to npm.

## What it does

- **Composes modules** — loads the modules named in `MCP_ACTIVE_MODULES` (default: all), each with an
  optional toolset suffix (`camunda7:read-only`, …), and merges their tools, widgets and pipeline steps.
- **Bundles the widget UI** — Vite + `vite-plugin-singlefile` builds `mcp-app.html`, a self-contained
  bundle (React, Tailwind, all widgets) exposed as the MCP resource `ui://automation-mcp/mcp-app.html`.
  The `dedupe` array in [`vite.config.ts`](vite.config.ts) is load-bearing — it keeps a single React /
  toolkit instance so in-widget `useCallTool()` works.
- **Serves HTTP** — streamable-HTTP MCP on `:8400/mcp`, plus the `mcp-use` inspector on `:8400/inspector`
  in dev.

The server is self-contained (tools + widget UI in one endpoint). Aggregating it with other MCP
servers is the job of an external MCP gateway (e.g. agentgateway) in front — there is no built-in
upstream/proxy federation.

## Run

```bash
# Published image (production)
docker run --rm -p 8400:8400 \
  -e CAMUNDA_BASE_URL=http://host.docker.internal:8410/engine-rest \
  -e PROMETHEUS_URL=http://host.docker.internal:9090 \
  docker.io/miragon/miragon-ai-server:latest

# From source (local dev — needs the Docker infra; see the root README)
pnpm dev          # build:ui + mcp-use dev on :8400, with the inspector
pnpm build        # build:ui (Vite widget bundle) + build:server (tsc)
pnpm start        # run the compiled server from dist/
```

Configuration is entirely environment-driven — see
[Configuration](../../README.md#configuration) and [`docs/operations.md`](../../docs/operations.md).

## Layout

| Path             | Contents                                                                          |
| ---------------- | --------------------------------------------------------------------------------- |
| `src/index.ts`   | Server entry — builds the mcp-use server, mounts modules, starts HTTP             |
| `src/ui/`        | Widget host bundle: `widget-registry.ts` (the host map) + `McpAppView` dispatcher |
| `vite.config.ts` | Single-file widget bundle config (keep the `dedupe` array)                        |
| `Dockerfile`     | Lives at the repo root; multi-stage build that produces the published image       |
