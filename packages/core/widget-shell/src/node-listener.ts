/**
 * The Node `http` listener of a composed server (production path only):
 * mcp-use's public `toNodeHandler` bridge behind a streaming request-body cap.
 *
 * Why: mcp-use 2's Node bridge reads every non-GET body into ONE string
 * before any middleware runs — the OAuth gate included — so a single huge
 * POST grows the process by gigabytes, authenticated or not. This listener
 * answers 413 as soon as the declared `Content-Length` or the bytes actually
 * received exceed the cap, discards the rest without keeping it, and only
 * then hands the (bounded) body to the bridge — which buffered it anyway.
 *
 * `mcp-use dev` serves through its own listener and is NOT capped.
 */
import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import { toNodeHandler, type NodeIncomingMessageLike } from "mcp-use/node"
import { jsonRpcErrorBody } from "./http-edge.js"

/** The fetch face the bridge drives — `MCPServer` satisfies it structurally. */
export interface FetchTarget {
  fetch: (request: Request) => Promise<Response>
}

export interface BodyLimitedListenerOptions {
  /** Body cap in bytes; larger requests get 413 before they are buffered. */
  maxBodyBytes: number
  /** How long the remainder of a refused upload is discarded before the socket is cut (default 2000 ms). */
  discardGraceMs?: number
  /** Observes bridge errors (the client still gets a JSON-RPC 500). */
  onError?: (error: Error) => void
}

/** A Node request listener that also tells the shutdown path what is still in flight. */
export interface BodyLimitedListener {
  (req: IncomingMessage, res: ServerResponse): void
  /** Requests whose response has not closed yet. */
  readonly inFlight: number
  /** Resolves once no request is in flight (immediately when idle). */
  idle(): Promise<void>
}

type BodyRead = { kind: "body"; chunks: Buffer[] } | { kind: "too-large" } | { kind: "aborted" }

/** Read the body while it stays under the cap; stop (without buffering) the moment it does not. */
function readCapped(req: IncomingMessage, limit: number): Promise<BodyRead> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const settle = (result: BodyRead): void => {
      if (settled) return
      settled = true
      req.off("data", onData)
      resolve(result)
    }
    const onData = (chunk: Buffer): void => {
      size += chunk.length
      if (size > limit) {
        req.pause()
        settle({ kind: "too-large" })
        return
      }
      chunks.push(chunk)
    }
    req.on("data", onData)
    req.once("end", () => settle({ kind: "body", chunks }))
    req.once("error", () => settle({ kind: "aborted" }))
    req.once("close", () => settle(req.complete ? { kind: "body", chunks } : { kind: "aborted" }))
  })
}

/** The bounded body, replayed to the bridge as the async-iterable request it expects. */
function replay(req: IncomingMessage, chunks: Buffer[]): NodeIncomingMessageLike {
  return Object.assign(Readable.from(chunks), {
    method: req.method,
    url: req.url,
    headers: req.headers,
  })
}

function rejectTooLarge(
  req: IncomingMessage,
  res: ServerResponse,
  limit: number,
  graceMs: number,
): void {
  const body = Buffer.from(
    jsonRpcErrorBody(
      `Payload too large: the request body exceeds ${limit} bytes (MCP_MAX_BODY_BYTES).`,
    ),
  )
  res.writeHead(413, {
    "content-type": "application/json",
    "content-length": body.length,
    connection: "close",
  })
  res.end(body)
  // Drain (never keep) what the client is still sending so it can read the
  // 413 instead of a reset, and cut the connection once the grace is up.
  req.resume()
  const timer = setTimeout(() => req.socket.destroy(), graceMs)
  timer.unref()
  req.socket.once("close", () => clearTimeout(timer))
}

/**
 * Build the listener: bodies of non-GET/HEAD requests are capped at
 * `maxBodyBytes` (413 otherwise), everything else goes through mcp-use's
 * `toNodeHandler` unchanged. Pass it to `http.createServer`.
 */
export function createBodyLimitedListener(
  target: FetchTarget,
  { maxBodyBytes, discardGraceMs = 2000, onError }: BodyLimitedListenerOptions,
): BodyLimitedListener {
  const bridge = toNodeHandler(
    { fetch: (request) => target.fetch(request) },
    onError ? { onerror: onError } : {},
  )
  let inFlight = 0
  let waiters: Array<() => void> = []
  const settle = (): void => {
    inFlight -= 1
    if (inFlight > 0) return
    const ready = waiters
    waiters = []
    for (const resolve of ready) resolve()
  }

  const serve = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = (req.method ?? "GET").toUpperCase()
    if (method === "GET" || method === "HEAD") return bridge(req, res)
    if (Number(req.headers["content-length"]) > maxBodyBytes) {
      return rejectTooLarge(req, res, maxBodyBytes, discardGraceMs)
    }
    const read = await readCapped(req, maxBodyBytes)
    if (read.kind === "too-large") return rejectTooLarge(req, res, maxBodyBytes, discardGraceMs)
    // A client that went away mid-upload has nobody left to answer.
    if (read.kind === "aborted") return
    return bridge(replay(req, read.chunks), res)
  }

  const listener = (req: IncomingMessage, res: ServerResponse): void => {
    inFlight += 1
    res.once("close", settle)
    serve(req, res).catch((error: unknown) => {
      onError?.(error instanceof Error ? error : new Error(String(error)))
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  }

  // defineProperties, not Object.assign: the count must stay a live getter.
  return Object.defineProperties(listener, {
    inFlight: { get: () => inFlight, enumerable: true },
    idle: {
      value: (): Promise<void> =>
        inFlight === 0 ? Promise.resolve() : new Promise<void>((resolve) => waiters.push(resolve)),
    },
  }) as BodyLimitedListener
}
