import assert from "node:assert/strict"
import path from "node:path"
import { before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { ESLint, Linter } from "eslint"
import tseslint from "typescript-eslint"

/**
 * Self-test of the architecture pattern gates in eslint.config.mjs (a gate
 * that has never been red is decoration). For each probe it asks the REAL
 * config which `no-restricted-syntax` options apply to a real path — so a
 * later block silently replacing an earlier block's selectors (flat config
 * does not merge one rule's options) turns this red — and then lints known-bad
 * snippets with exactly those options.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const C7 = "packages/connectors/camunda/camunda7-connector/src"
const AN = "packages/connectors/analytics/analytics-connector/src"

const eslint = new ESLint({ cwd: repoRoot })
const linter = new Linter({ configType: "flat" })

/** The effective `no-restricted-syntax` options for a repo path (null when off). */
async function restrictedSyntaxFor(rel) {
  const config = await eslint.calculateConfigForFile(path.join(repoRoot, rel))
  const setting = config.rules?.["no-restricted-syntax"]
  return setting && setting[0] !== 0 && setting[0] !== "off" ? setting : null
}

/** Messages the effective gate options report for `code` at `rel`. */
async function gateMessages(rel, code) {
  const options = await restrictedSyntaxFor(rel)
  if (!options) return []
  return linter
    .verify(
      code,
      [
        {
          files: ["**/*.ts", "**/*.tsx"],
          languageOptions: {
            parser: tseslint.parser,
            parserOptions: { ecmaFeatures: { jsx: true } },
          },
          rules: { "no-restricted-syntax": options },
        },
      ],
      { filename: path.join(repoRoot, rel) },
    )
    .map((m) => m.message)
}

const isRegistrarHit = (m) => m.includes("createToolRegistrar")
const isDateHit = (m) => m.includes("widget-shell/widgets")

const REGISTRAR_ESCAPES = {
  "direct call": 'server.tool("x", {}, handler)',
  "registerTool call": 'server.registerTool("x", {}, handler)',
  "optional call": 'server?.tool("x", {}, handler)',
  "computed string key": 'server["tool"]("x", {}, handler)',
  "computed template key": 'server[`tool`]("x", {}, handler)',
  ".call": 'server.tool.call(server, "x", {}, handler)',
  ".bind": 'server.tool.bind(server)("x", {}, handler)',
  ".apply": 'server.tool.apply(server, ["x", {}, handler])',
  "destructured declaration": 'const { tool } = server\ntool("x", {}, handler)',
  "destructured + renamed": 'const { registerTool: register } = server\nregister("x")',
  "destructured string key": 'const { "tool": t } = server\nt("x")',
  "destructuring assignment": 'let tool\n;({ tool } = server)\ntool("x")',
  "destructuring assignment, string key": 'let t\n;({ "tool": t } = server)\nt.call(server, "x")',
  "Reflect.get": 'Reflect.get(server, "tool")("x", {}, handler)',
  "Reflect.get, template key": 'Reflect.get(server, `tool`).call(server, "x")',
}

describe("registrar gate (invariant 1) catches every spelling", () => {
  for (const rel of [`${C7}/tools/__probe__.ts`, `${AN}/tools/__probe__.tsx`]) {
    for (const [label, code] of Object.entries(REGISTRAR_ESCAPES)) {
      it(`${label} — ${path.extname(rel)}`, async () => {
        const messages = await gateMessages(rel, code)
        assert.ok(messages.some(isRegistrarHit), `${rel}: "${code}" passed the registrar gate`)
      })
    }
  }

  it("stays quiet on test fakes, parameter destructuring and unrelated names", async () => {
    const code = [
      "const server = { tool } as unknown as MCPServer",
      "const fn = ({ tool, list }: Case) => [tool, list]",
      "const name = tool.name + toolName + obj.tools.length",
    ].join("\n")
    assert.deepEqual(await gateMessages(`${C7}/tools/__probe__.test.ts`, code), [])
  })

  it("exempts exactly the widget-tools path", async () => {
    for (const rel of [
      `${C7}/widget-tools.ts`,
      `${C7}/widget-tools/__probe__.ts`,
      `${C7}/tools/user-profile.ts`,
      `${AN}/widget-tools.ts`,
      `${AN}/widget-tools/__probe__.ts`,
      `${AN}/settings-tools.ts`,
    ]) {
      const messages = await gateMessages(rel, 'server.tool("x", {}, handler)')
      assert.equal(messages.filter(isRegistrarHit).length, 0, rel)
    }
  })
})

describe("gates sharing a glob are merged, not overridden", () => {
  let widgetTs
  let widgetTsx
  before(async () => {
    const code = 'server.tool("x")\nnew Intl.DateTimeFormat("de")\nd.toLocaleDateString()'
    widgetTs = await gateMessages(`${C7}/widgets/__probe__.ts`, code)
    widgetTsx = await gateMessages(`${AN}/widgets/__probe__.tsx`, code)
  })

  it("connector widget files carry BOTH the registrar and the date gate", () => {
    for (const messages of [widgetTs, widgetTsx]) {
      assert.ok(messages.some(isRegistrarHit), "registrar gate dropped for widgets")
      assert.equal(messages.filter(isDateHit).length, 2, "date gate dropped for widgets")
    }
  })

  it("the app's UI keeps the date gate", async () => {
    const messages = await gateMessages(
      "apps/mcp-server-camunda7/src/ui/__probe__.tsx",
      "d.toLocaleTimeString()",
    )
    assert.equal(messages.filter(isDateHit).length, 1)
  })
})
