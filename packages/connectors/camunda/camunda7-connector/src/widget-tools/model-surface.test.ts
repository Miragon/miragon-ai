import { describe, expect, it, vi } from "vitest"
import type { MCPServer } from "mcp-use"
import { createModelSurface } from "./model-surface.js"

/** A stand-in server: `tool()` returns a ref, other members read `this`. */
function fakeServer() {
  const tool = vi.fn((definition: { name: string }) => ({ ref: definition.name }))
  const server = {
    tool,
    label: "real",
    whoAmI(this: { label: string }) {
      return this.label
    },
  }
  return { server, tool }
}

describe("createModelSurface", () => {
  it("records the tools registered for the model — never an app-only feed", () => {
    const surface = createModelSurface()
    const { server, tool } = fakeServer()
    const recorded = surface.record(server as unknown as MCPServer)
    const register = (definition: Record<string, unknown>) =>
      (recorded.tool as unknown as (d: Record<string, unknown>, cb: () => void) => unknown)(
        definition,
        () => undefined,
      )

    expect(register({ name: "camunda7_b" })).toEqual({ ref: "camunda7_b" })
    register({ name: "camunda7_a", visibility: ["model", "app"] })
    register({ name: "camunda7_feed_data", visibility: ["app"] })
    register({ name: "camunda7_other_data", visibility: "app" })

    // Every registration still reaches the real server, app-only ones included.
    expect(tool).toHaveBeenCalledTimes(4)
    expect(surface.tools()).toEqual(["camunda7_a", "camunda7_b"])
  })

  it("collects across every recorded view of the server", () => {
    const surface = createModelSurface()
    const register = (server: MCPServer, name: string) =>
      (server.tool as unknown as (d: { name: string }, cb: () => void) => unknown)(
        { name },
        () => undefined,
      )
    register(surface.record(fakeServer().server as unknown as MCPServer), "camunda7_x")
    register(surface.record(fakeServer().server as unknown as MCPServer), "camunda7_y")
    expect(surface.tools()).toEqual(["camunda7_x", "camunda7_y"])
  })

  it("forwards every other member to the real server, bound to it", () => {
    const { server } = fakeServer()
    const recorded = createModelSurface().record(server as unknown as MCPServer) as unknown as {
      label: string
      whoAmI: () => string
    }
    const { whoAmI } = recorded
    expect(recorded.label).toBe("real")
    expect(whoAmI()).toBe("real")
  })
})
