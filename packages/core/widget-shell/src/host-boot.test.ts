import { afterEach, describe, expect, it, vi } from "vitest"
import {
  installToolCallLogging,
  resolvePort,
  swallowDevCliViewsPrime,
  type ToolCallMiddlewareHost,
} from "./host-boot.js"

describe("resolvePort", () => {
  it("falls back to the default when PORT is unset", () => {
    expect(resolvePort({ env: {} })).toBe(8400)
  })

  it("falls back on an empty or whitespace-only assignment (env_file `PORT=`)", () => {
    expect(resolvePort({ env: { PORT: "" } })).toBe(8400)
    expect(resolvePort({ env: { PORT: "   " } })).toBe(8400)
  })

  it("parses an explicit port and honors a custom fallback", () => {
    expect(resolvePort({ env: { PORT: "9000" } })).toBe(9000)
    expect(resolvePort({ env: {}, fallback: 1234 })).toBe(1234)
  })

  it.each(["abc", "0", "65536", "-1", "80.5"])("rejects %j", (value) => {
    expect(() => resolvePort({ env: { PORT: value } })).toThrow(
      `invalid PORT "${value}" — expected an integer 1-65535`,
    )
  })

  it("prefixes the host label onto the error", () => {
    expect(() => resolvePort({ env: { PORT: "abc" }, label: "test-app" })).toThrow(
      `[test-app] invalid PORT "abc" — expected an integer 1-65535`,
    )
  })
})

describe("swallowDevCliViewsPrime", () => {
  it("does nothing outside the dev CLI", () => {
    const server = {}
    swallowDevCliViewsPrime(server, {})
    expect("__primeViews" in server).toBe(false)
  })

  it("replaces __primeViews with a no-op under the dev CLI", () => {
    const server: { __primeViews?: () => void } = {
      __primeViews: () => {
        throw new Error("double prime")
      },
    }
    swallowDevCliViewsPrime(server, { MCP_USE_DEV_CLI: "1" })
    expect(() => server.__primeViews?.()).not.toThrow()
  })
})

describe("installToolCallLogging", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function hostWithCapture() {
    let handler: ((ctx: unknown, next: () => Promise<unknown>) => Promise<unknown>) | undefined
    const server: ToolCallMiddlewareHost = {
      use: (pattern, fn) => {
        expect(pattern).toBe("mcp:tools/call")
        handler = fn
        return undefined
      },
    }
    installToolCallLogging(server, "test-app")
    if (!handler) throw new Error("middleware was not registered")
    return handler
  }

  it("logs name, outcome ok, and passes the result through", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const handler = hostWithCapture()
    const result = { content: [] }

    const returned = await handler({ params: { name: "notes_list_notes" } }, async () => result)

    expect(returned).toBe(result)
    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0][0]).toMatch(/^\[test-app\] tools\/call notes_list_notes ok in \d+ms$/)
  })

  it("logs isError results as error and unknown tool names as 'unknown'", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const handler = hostWithCapture()

    await handler({}, async () => ({ isError: true }))

    expect(log.mock.calls[0][0]).toMatch(/^\[test-app\] tools\/call unknown error in \d+ms$/)
  })

  it("logs and rethrows on a throwing handler", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const handler = hostWithCapture()
    const boom = new Error("boom")

    await expect(
      handler({ params: { name: "notes_show_notes" } }, async () => {
        throw boom
      }),
    ).rejects.toThrow(boom)
    expect(log.mock.calls[0][0]).toMatch(
      /^\[test-app\] tools\/call notes_show_notes error in \d+ms$/,
    )
  })
})
