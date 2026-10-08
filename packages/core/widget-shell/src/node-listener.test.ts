import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createBodyLimitedListener, type FetchTarget } from "./node-listener.js"

const servers: http.Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        }),
    ),
  )
})

/** An echo target: answers with the method and the body it received. */
function echoTarget(): FetchTarget & { fetch: ReturnType<typeof vi.fn> } {
  return {
    fetch: vi.fn(async (request: Request) =>
      Response.json({ method: request.method, body: await request.text() }),
    ),
  }
}

async function serve(target: FetchTarget, maxBodyBytes: number, discardGraceMs?: number) {
  const listener = createBodyLimitedListener(target, {
    maxBodyBytes,
    ...(discardGraceMs === undefined ? {} : { discardGraceMs }),
  })
  const server = http.createServer(listener)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  return { listener, port: (server.address() as AddressInfo).port }
}

interface Sent {
  status: number
  body: string
  /** Whether the client had finished uploading when the response arrived. */
  finishedSending: boolean
}

/** POST `chunks` (or a declared length) — the request is ended only when `end` is set. */
function post(
  port: number,
  options: { chunks: Buffer[]; end: boolean; contentLength?: number },
): Promise<Sent> {
  return new Promise((resolve, reject) => {
    let finishedSending = false
    const headers: http.OutgoingHttpHeaders = { "content-type": "application/json" }
    if (options.contentLength !== undefined) headers["content-length"] = options.contentLength
    const req = http.request(
      { host: "127.0.0.1", port, method: "POST", path: "/mcp", headers, agent: false },
      (res) => {
        const received: Buffer[] = []
        res.on("data", (chunk: Buffer) => received.push(chunk))
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(received).toString("utf8"),
            finishedSending,
          })
          req.destroy()
        })
      },
    )
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "ECONNRESET" && error.code !== "EPIPE") reject(error)
    })
    req.on("finish", () => {
      finishedSending = true
    })
    for (const chunk of options.chunks) req.write(chunk)
    if (options.end) req.end()
  })
}

describe("createBodyLimitedListener", () => {
  it("passes bodies within the cap through to the fetch target unchanged", async () => {
    const target = echoTarget()
    const { port } = await serve(target, 64)
    const res = await post(port, {
      chunks: [Buffer.from('{"a":'), Buffer.from("1}")],
      end: true,
    })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ method: "POST", body: '{"a":1}' })
  })

  it("accepts a body of exactly the cap", async () => {
    const target = echoTarget()
    const { port } = await serve(target, 8)
    const res = await post(port, { chunks: [Buffer.alloc(8, 0x61)], end: true })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ method: "POST", body: "aaaaaaaa" })
  })

  it("answers 413 on a declared Content-Length over the cap without reading or forwarding", async () => {
    const target = echoTarget()
    const { port } = await serve(target, 1024)
    const res = await post(port, { chunks: [Buffer.alloc(16)], end: false, contentLength: 4096 })
    expect(res.status).toBe(413)
    expect(res.finishedSending).toBe(false)
    expect(JSON.parse(res.body)).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Payload too large: the request body exceeds 1024 bytes (MCP_MAX_BODY_BYTES).",
      },
      id: null,
    })
    expect(target.fetch).not.toHaveBeenCalled()
  })

  it("answers 413 mid-stream for an undeclared body while the client is still sending", async () => {
    const target = echoTarget()
    const { port } = await serve(target, 1024)
    const res = await post(port, { chunks: [Buffer.alloc(600), Buffer.alloc(600)], end: false })
    expect(res.status).toBe(413)
    expect(res.finishedSending).toBe(false)
    expect(target.fetch).not.toHaveBeenCalled()
  })

  it("cuts a refused upload's connection after the discard grace", async () => {
    const { port } = await serve(echoTarget(), 16, 20)
    const closed = new Promise<void>((resolve) => {
      const req = http.request({
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/",
        agent: false,
        headers: { "content-length": 1_000_000 },
      })
      req.on("error", () => resolve())
      req.on("close", () => resolve())
      req.on("response", (res) => res.resume())
      // Keep uploading slowly: only the server's grace timer can end this.
      const timer = setInterval(() => req.write(Buffer.alloc(8)), 5)
      req.on("close", () => clearInterval(timer))
    })
    await expect(closed).resolves.toBeUndefined()
  })

  it("leaves GET requests (no body) to the bridge untouched", async () => {
    const target = echoTarget()
    const { port } = await serve(target, 1)
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      http
        .get({ host: "127.0.0.1", port, path: "/x", agent: false }, (r) => {
          const chunks: Buffer[] = []
          r.on("data", (c: Buffer) => chunks.push(c))
          r.on("end", () =>
            resolve({ status: r.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
          )
        })
        .on("error", reject)
    })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ method: "GET", body: "" })
  })

  it("tracks in-flight requests and resolves idle() once they finish", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const target: FetchTarget = {
      fetch: async () => {
        await gate
        return new Response("done")
      },
    }
    const { listener, port } = await serve(target, 1024)
    await expect(listener.idle()).resolves.toBeUndefined()

    const pending = post(port, { chunks: [Buffer.from("{}")], end: true })
    await vi.waitFor(() => expect(listener.inFlight).toBe(1))
    let idle = false
    const idlePromise = listener.idle().then(() => {
      idle = true
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(idle).toBe(false)

    release()
    expect((await pending).status).toBe(200)
    await idlePromise
    expect(listener.inFlight).toBe(0)
  })

  it("reports a throwing target through onError and answers a JSON-RPC 500", async () => {
    const onError = vi.fn()
    const listener = createBodyLimitedListener(
      {
        fetch: () => Promise.reject(new Error("boom")),
      },
      { maxBodyBytes: 1024, onError },
    )
    const server = http.createServer(listener)
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const res = await post((server.address() as AddressInfo).port, {
      chunks: [Buffer.from("{}")],
      end: true,
    })
    expect(res.status).toBe(500)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }))
  })

  it("does not answer a client that aborted mid-upload", async () => {
    const target = echoTarget()
    const { listener, port } = await serve(target, 1024)
    await new Promise<void>((resolve) => {
      const req = http.request({ host: "127.0.0.1", port, method: "POST", agent: false })
      req.on("error", () => resolve())
      req.write(Buffer.alloc(10))
      setTimeout(() => {
        req.destroy()
        resolve()
      }, 20)
    })
    await vi.waitFor(() => expect(listener.inFlight).toBe(0))
    expect(target.fetch).not.toHaveBeenCalled()
  })
})
