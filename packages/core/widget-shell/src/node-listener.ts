/**
 * The Node `http` listener of a composed server (production path only):
 * mcp-use's public `toNodeHandler` bridge behind the edge's admission checks.
 *
 * Why: mcp-use 2's Node bridge reads every non-GET body into ONE string
 * before any middleware runs, and its JSON middleware then parses it — into a
 * heap graph up to ~20× the body — all before the OAuth gate. So before a
 * body reaches the bridge:
 *
 * 1. a request the edge guard refuses anyway (foreign `Host`/`Origin`) has
 *    its body discarded unread; the app still answers — and counts — the 403;
 * 2. a body over the cap gets 413 as soon as the declared `Content-Length` or
 *    the bytes actually received exceed it;
 * 3. a body that would push the bytes held across in-flight requests over the
 *    budget gets 503 + `Retry-After`. A request holds its share until its
 *    response closes, so the budget also bounds the parse after the hand-off.
 *
 * A refused upload is drained without keeping a byte and cut after a grace.
 * `mcp-use dev` serves through its own listener and is NOT capped.
 */
import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import { toNodeHandler, type NodeIncomingMessageLike } from "mcp-use/node"
import { IN_FLIGHT_BODY_MULTIPLE, jsonRpcErrorBody } from "./http-edge.js"

/** The fetch face the bridge drives — `MCPServer` satisfies it structurally. */
export interface FetchTarget {
  fetch: (request: Request) => Promise<Response>
}

export interface BodyLimitedListenerOptions {
  /** Body cap in bytes; larger requests get 413 before they are buffered. */
  maxBodyBytes: number
  /**
   * Body bytes held across all requests whose response is still open; a body
   * that would exceed it gets 503 (default {@link IN_FLIGHT_BODY_MULTIPLE} × the cap).
   */
  maxInFlightBodyBytes?: number
  /**
   * Requests the app refuses whatever their body (the Host/Origin guard):
   * their body is discarded unread and the app answers them bodiless.
   */
  refusedBeforeBody?: (req: IncomingMessage) => boolean
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
  /** Body bytes those requests hold against the in-flight budget. */
  readonly heldBodyBytes: number
  /** Resolves once no request is in flight (immediately when idle). */
  idle(): Promise<void>
}

/** One request's share of the in-flight budget: grows with its body, released on close. */
interface BudgetShare {
  /** Hold `total` bytes in all — `false` (holding nothing more) when the budget has no room. */
  grow(total: number): boolean
  release(): void
}

type BodyRead =
  | { kind: "body"; chunks: Buffer[] }
  | { kind: "too-large" }
  | { kind: "busy" }
  | { kind: "aborted" }

/** Read the body while it stays under the cap and the budget; stop (without buffering) the moment it does not. */
function readCapped(req: IncomingMessage, limit: number, share: BudgetShare): Promise<BodyRead> {
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
    const stop = (kind: "too-large" | "busy"): void => {
      req.pause()
      settle({ kind })
    }
    const onData = (chunk: Buffer): void => {
      size += chunk.length
      if (size > limit) return stop("too-large")
      if (!share.grow(size)) return stop("busy")
      chunks.push(chunk)
    }
    req.on("data", onData)
    req.once("end", () => settle({ kind: "body", chunks }))
    req.once("error", () => settle({ kind: "aborted" }))
    req.once("close", () => settle(req.complete ? { kind: "body", chunks } : { kind: "aborted" }))
  })
}

/** The bounded body, replayed to the bridge as the async-iterable request it expects. */
function replay(
  req: IncomingMessage,
  chunks: Buffer[],
  headers: IncomingMessage["headers"] = req.headers,
): NodeIncomingMessageLike {
  return Object.assign(Readable.from(chunks), { method: req.method, url: req.url, headers })
}

/**
 * The request without its body. The body headers go too: nothing may wait for
 * bytes, and mcp-use's JSON middleware — which runs BEFORE the guard — would
 * answer an empty `application/json` body 400 instead of letting the guard 403.
 */
function bodiless(req: IncomingMessage): NodeIncomingMessageLike {
  const headers = { ...req.headers }
  for (const name of ["content-length", "transfer-encoding", "content-type", "content-encoding"]) {
    delete headers[name]
  }
  return replay(req, [], headers)
}

interface Refusal {
  status: number
  message: string
  headers?: Record<string, string>
}

function refuse(
  req: IncomingMessage,
  res: ServerResponse,
  { status, message, headers = {} }: Refusal,
  graceMs: number,
): void {
  const body = Buffer.from(jsonRpcErrorBody(message))
  res.writeHead(status, {
    ...headers,
    "content-type": "application/json",
    "content-length": body.length,
    connection: "close",
  })
  res.end(body)
  // Drain (never keep) what the client is still sending so it can read the
  // answer instead of a reset, and cut the connection once the grace is up.
  req.resume()
  const timer = setTimeout(() => req.socket.destroy(), graceMs)
  timer.unref()
  req.socket.once("close", () => clearTimeout(timer))
}

/**
 * Build the listener: bodies of non-GET/HEAD requests are admitted against the
 * cap (413) and the in-flight budget (503), bodies of requests the guard
 * refuses are never read, everything else goes through mcp-use's
 * `toNodeHandler` unchanged. Pass it to `http.createServer`.
 */
export function createBodyLimitedListener(
  target: FetchTarget,
  {
    maxBodyBytes,
    maxInFlightBodyBytes = IN_FLIGHT_BODY_MULTIPLE * maxBodyBytes,
    refusedBeforeBody,
    discardGraceMs = 2000,
    onError,
  }: BodyLimitedListenerOptions,
): BodyLimitedListener {
  const bridge = toNodeHandler(
    { fetch: (request) => target.fetch(request) },
    onError ? { onerror: onError } : {},
  )
  const tooLarge: Refusal = {
    status: 413,
    message: `Payload too large: the request body exceeds ${maxBodyBytes} bytes (MCP_MAX_BODY_BYTES).`,
  }
  const busy: Refusal = {
    status: 503,
    message: `Server busy: request bodies in flight would exceed ${maxInFlightBodyBytes} bytes — retry shortly.`,
    headers: { "retry-after": "1" },
  }
  let inFlight = 0
  let heldBodyBytes = 0
  let waiters: Array<() => void> = []
  const settle = (): void => {
    inFlight -= 1
    if (inFlight > 0) return
    const ready = waiters
    waiters = []
    for (const resolve of ready) resolve()
  }
  const budgetShare = (): BudgetShare => {
    let held = 0
    return {
      grow: (total) => {
        const extra = total - held
        if (extra <= 0) return true
        if (heldBodyBytes + extra > maxInFlightBodyBytes) return false
        heldBodyBytes += extra
        held = total
        return true
      },
      release: () => {
        heldBodyBytes -= held
        held = 0
      },
    }
  }

  const serve = async (
    req: IncomingMessage,
    res: ServerResponse,
    share: BudgetShare,
  ): Promise<void> => {
    const method = (req.method ?? "GET").toUpperCase()
    if (method === "GET" || method === "HEAD") return bridge(req, res)
    if (refusedBeforeBody?.(req)) {
      // Discard the body unread; the app's guard answers (and counts) the 403.
      req.resume()
      res.setHeader("connection", "close")
      return bridge(bodiless(req), res)
    }
    const declared = Number(req.headers["content-length"])
    if (declared > maxBodyBytes) return refuse(req, res, tooLarge, discardGraceMs)
    if (declared > 0 && !share.grow(declared)) return refuse(req, res, busy, discardGraceMs)
    const read = await readCapped(req, maxBodyBytes, share)
    if (read.kind === "too-large") return refuse(req, res, tooLarge, discardGraceMs)
    if (read.kind === "busy") return refuse(req, res, busy, discardGraceMs)
    // A client that went away mid-upload has nobody left to answer.
    if (read.kind === "aborted") return
    return bridge(replay(req, read.chunks), res)
  }

  const listener = (req: IncomingMessage, res: ServerResponse): void => {
    inFlight += 1
    // The share exists before the first await, so its release is registered
    // even for a client that disconnects at once.
    const share = budgetShare()
    res.once("close", () => {
      share.release()
      settle()
    })
    serve(req, res, share).catch((error: unknown) => {
      onError?.(error instanceof Error ? error : new Error(String(error)))
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  }

  // defineProperties, not Object.assign: the counts must stay live getters.
  return Object.defineProperties(listener, {
    inFlight: { get: () => inFlight, enumerable: true },
    heldBodyBytes: { get: () => heldBodyBytes, enumerable: true },
    idle: {
      value: (): Promise<void> =>
        inFlight === 0 ? Promise.resolve() : new Promise<void>((resolve) => waiters.push(resolve)),
    },
  }) as BodyLimitedListener
}
