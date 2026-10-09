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

/** How long an upload that is never finished may wait for its answer. */
const OPEN_UPLOAD_ANSWER_MS = 2000

/**
 * Stream a body that is never finished: resolves with the response the server
 * sends WHILE the client is still uploading — proof the server refuses the
 * body before buffering it, instead of after reading it whole. A server that
 * waits for the rest gets no chance to: the promise rejects after
 * {@link OPEN_UPLOAD_ANSWER_MS} with that diagnosis instead of hanging the test.
 */
export async function streamOversizedBody(
  port: number,
  options: { chunkBytes: number; contentLength?: number; headers?: Record<string, string> },
): Promise<RawResponse> {
  return await new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {
      "content-type": "application/json",
      ...options.headers,
    }
    if (options.contentLength !== undefined) headers["content-length"] = options.contentLength
    const req = http.request(
      { host: "127.0.0.1", port, method: "POST", path: "/mcp", headers, agent: false },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () => {
          clearTimeout(unanswered)
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          })
          req.destroy()
        })
      },
    )
    // Deliberately never ended: only an answer to the OPEN upload resolves.
    const unanswered = setTimeout(() => {
      req.destroy()
      reject(
        new Error(
          `No answer within ${OPEN_UPLOAD_ANSWER_MS} ms while the upload was still open — ` +
            "the server buffered the body instead of refusing it",
        ),
      )
    }, OPEN_UPLOAD_ANSWER_MS)
    // The server cuts the connection after answering; a write racing that is
    // expected and not a test failure.
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNRESET" || error.code === "EPIPE") return
      reject(error)
    })
    req.write(Buffer.alloc(options.chunkBytes, 0x20))
  })
}
