import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { SERVED_FONT_FILES, SERVED_FONT_PATH } from "@miragon/pulse-widget-shell/server"
import { bootServer, type BootedServer } from "./boot-server.js"
import { rawRequest } from "./raw-http.js"

const FILES = Object.values(SERVED_FONT_FILES).map((file) => `${SERVED_FONT_PATH}/${file}`)

/**
 * The font route on the REAL composition (`createApp`, production listener):
 * Geist and Geist Mono as the views load them — cross-origin from the host's
 * sandboxed iframe — and the HTTP edge around them (#324: the Host guard
 * applies, the Origin half lets a GET through, the body cap is not in the way).
 */
describe("served fonts (/fonts/geist-<version>/…)", () => {
  let server: BootedServer

  beforeAll(async () => {
    server = await bootServer({ env: { MCP_URL: "https://mcp.example.test/mcp" } })
  })

  afterAll(async () => {
    await server?.close()
  })

  it("serves both woff2 files immutable and readable from any origin", async () => {
    for (const path of FILES) {
      const res = await rawRequest({
        port: server.port,
        path,
        // How a font load from a srcdoc view arrives: CORS mode, opaque origin.
        headers: { host: "mcp.example.test", origin: "null" },
      })
      expect(res.status, path).toBe(200)
      expect(res.headers, path).toMatchObject({
        "content-type": "font/woff2",
        "cache-control": "public, max-age=31536000, immutable",
        "access-control-allow-origin": "*",
        "cross-origin-resource-policy": "cross-origin",
      })
      expect(Number(res.headers["content-length"]), path).toBeGreaterThan(10_000)
    }
  })

  it("refuses a foreign Host like every other non-operational route", async () => {
    const res = await rawRequest({
      port: server.port,
      path: FILES[0],
      headers: { host: "attacker.example" },
    })
    expect(res.status).toBe(403)
  })

  it("lets the view's GET through whatever its Origin, but serves no other method", async () => {
    const hosted = await rawRequest({
      port: server.port,
      path: FILES[1],
      headers: { origin: "https://0123abcd.claudemcpcontent.com" },
    })
    expect(hosted.status).toBe(200)
    const post = await rawRequest({
      port: server.port,
      method: "POST",
      path: FILES[1],
      headers: { origin: "https://mcp.example.test", "content-type": "font/woff2" },
      body: "x",
    })
    expect(post.status).toBe(404)
  })
})
