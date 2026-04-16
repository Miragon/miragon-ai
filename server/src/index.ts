#!/usr/bin/env node

import { MCPServer, RESOURCE_MIME_TYPE, text } from "mcp-use/server"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { getFrameworkManifest, renderView, type LayoutConfig } from "@miragon/mcp-toolkit-core"
import { createRegistries, registerModuleTools, registerWidgetTools } from "./setup.js"

const { stepRegistry, widgetRegistry, config, appConfigs, plugins } = createRegistries()

const rowSchema = z.object({
  row: z.array(
    z.object({
      widget: z.string().describe("Widget ID from the manifest. Use only registered IDs."),
      span: z.number().optional().describe("Grid columns (1-12)"),
    }),
  ),
})

const layoutSchema = z
  .union([
    z.array(rowSchema).describe("Flat rows (legacy format)"),
    z.object({ rows: z.array(rowSchema) }).describe("Explicit rows"),
    z
      .object({
        tabs: z.array(
          z.object({
            label: z.string().describe("Tab label"),
            rows: z.array(rowSchema),
          }),
        ),
      })
      .describe("Tabs — widgets grouped in tabs"),
  ])
  .describe("Widget layout: flat rows, { rows }, or { tabs }")

const server = new MCPServer({
  name: "automation-mcp",
  version: "0.1.0",
  host: "0.0.0.0",
  baseUrl: process.env.MCP_URL || undefined,
})

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname

const resourceUri = "ui://automation-mcp/mcp-app.html"

// Framework meta-tools
server.tool(
  {
    name: "get-framework-manifest",
    description:
      "Returns all active apps, registered pipeline steps, widgets, and their key contracts. Call this first to understand which data can be loaded and which views can be composed via render-view.",
    annotations: { readOnlyHint: true },
  },
  // eslint-disable-next-line @typescript-eslint/require-await -- mcp-use requires async handler signature
  async () => {
    const manifest = getFrameworkManifest(stepRegistry, widgetRegistry, config)
    return text(JSON.stringify(manifest, null, 2))
  },
)

server.tool(
  {
    name: "render-view",
    title: "Automation MCP View",
    description:
      "Composes a UI from pipeline steps and widgets. IMPORTANT: call get-framework-manifest first to learn which step IDs and widget IDs exist. Use only IDs from the manifest.",
    schema: z.object({
      keys: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Initial keys available to the widgets, e.g. { "camunda7:processInstanceId": "..." }',
        ),
      steps: z
        .array(
          z.object({
            id: z.string().describe('Context ID, e.g. "instance"'),
            step: z.string().describe('Registered step, e.g. "camunda7:load-process-instance"'),
            optional: z.boolean().optional(),
          }),
        )
        .optional()
        .describe(
          "Optional pipeline steps that compute keys before rendering. Without steps only the provided keys are used.",
        ),
      layout: layoutSchema,
      title: z.string().optional().describe("Optional title"),
    }),
    _meta: { ui: { resourceUri } },
  },
  async (params) => {
    return renderView(
      {
        keys: params.keys,
        steps: params.steps,
        layout: params.layout as LayoutConfig,
        title: params.title,
      },
      stepRegistry,
      appConfigs,
    )
  },
)

// Domain tools from every active module
registerModuleTools(server, plugins)

// Widget tools (show_* etc.) — direct single-widget renderers
registerWidgetTools(server, resourceUri, plugins)

// Refresh tool: lets the UI re-run the pipeline with stored params
server.tool(
  {
    name: "refresh-view",
    title: "Re-run pipeline",
    description: "Re-executes the pipeline with the stored refresh parameters.",
    schema: z.object({
      keys: z.record(z.string(), z.unknown()).optional(),
      steps: z
        .array(
          z.object({
            id: z.string(),
            step: z.string(),
            optional: z.boolean().optional(),
          }),
        )
        .optional(),
      layout: layoutSchema,
      title: z.string().optional(),
    }),
    _meta: { ui: { resourceUri, visibility: ["app"] } },
  },
  async (params) => {
    return renderView(
      {
        keys: params.keys,
        steps: params.steps,
        layout: params.layout as LayoutConfig,
        title: params.title,
      },
      stepRegistry,
      appConfigs,
    )
  },
)

server.resource(
  {
    name: "mcp-app-html",
    uri: resourceUri,
    mimeType: RESOURCE_MIME_TYPE,
  },
  async () => {
    const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8")
    return {
      contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
    }
  },
)

await server.listen(Number(process.env.PORT ?? 3010))
