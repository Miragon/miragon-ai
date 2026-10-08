import http from "node:http"

/**
 * Raw HTTP against the in-process server: `fetch` (undici) refuses to set a
 * `Host` header and cannot hold a request body open, and both are exactly
 * what the edge guards are about.
 */
export interface RawResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

export interface RawRequestOptions {
  port: number
  method?: string
  path?: string
  headers?: Record<string, string | number>
  body?: string | Buffer
}

export async function rawRequest({
  port,
  method = "GET",
  path = "/",
  headers = {},
  body,
}: RawRequestOptions): Promise<RawResponse> {
  return await new Promise((resolve, reject) => {
    // `agent: false`: a fresh connection per request — a pooled keep-alive
    // socket would blur "refused" vs "reset" around shutdown.
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers, agent: false },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        )
        res.on("error", reject)
      },
    )
    req.on("error", reject)
    req.end(body)
  })
}

/** A JSON-RPC `initialize` POST to `/mcp` — the first request any MCP client sends. */
export function initializeRequest(
  port: number,
  headers: Record<string, string> = {},
): Promise<RawResponse> {
  return rawRequest({
    port,
    method: "POST",
    path: "/mcp",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "edge-test", version: "0.0.0" },
      },
    }),
  })
}

/**
 * Stream a body that is never finished: resolves with the response the server
 * sends WHILE the client is still uploading — proof the server rejects an
 * oversized body before buffering it, instead of after reading it whole.
 */
export async function streamOversizedBody(
  port: number,
  options: { chunkBytes: number; contentLength?: number },
): Promise<{ status: number; body: string; finishedSending: boolean }> {
  return await new Promise((resolve, reject) => {
    let finishedSending = false
    const headers: Record<string, string | number> = { "content-type": "application/json" }
    if (options.contentLength !== undefined) headers["content-length"] = options.contentLength
    const req = http.request(
      { host: "127.0.0.1", port, method: "POST", path: "/mcp", headers, agent: false },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            finishedSending,
          })
          req.destroy()
        })
      },
    )
    // The server cuts the connection after answering; a write racing that is
    // expected and not a test failure.
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNRESET" || error.code === "EPIPE") return
      reject(error)
    })
    req.write(Buffer.alloc(options.chunkBytes, 0x20))
    // Deliberately NOT ending the request: a server that buffers the whole
    // body would wait here forever (the test then times out).
    req.on("finish", () => {
      finishedSending = true
    })
  })
}
