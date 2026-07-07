// Static server for the host simulation: serves this directory (host shim +
// fixtures) plus the built widget bundle from ../dist under /app/. Plain
// node:http — iframes and postMessage need an http origin, file:// won't do.
import http from "node:http"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(root, "..", "dist")
const port = Number(process.env.PORT ?? 8788)

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost")
      const pathname = decodeURIComponent(url.pathname)
      let file
      if (pathname.startsWith("/app/")) {
        file = path.join(distDir, pathname.slice("/app/".length))
        if (!file.startsWith(distDir + path.sep)) throw new Error("forbidden")
      } else {
        file = path.join(root, pathname === "/" ? "host-sim.html" : pathname)
        if (!file.startsWith(root + path.sep)) throw new Error("forbidden")
      }
      const data = await readFile(file)
      res.writeHead(200, {
        "content-type": contentTypes[path.extname(file)] ?? "application/octet-stream",
      })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end("not found")
    }
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`host-sim server listening on http://127.0.0.1:${port}`)
  })
