# @miragon-ai/client-cibseven

TypeScript client for the [CIB Seven](https://cibseven.org/) REST API: an SDK
generated with [`@hey-api/openapi-ts`](https://heyapi.dev/) plus hand-written,
MCP-oriented Zod input schemas. There is no official TypeScript client for
CIB Seven — this package fills that gap for the Miragon AI platform and is
usable by any CIB Seven / Camunda 7 project.

## Exports

| Subpath     | Contents                                                                      |
| ----------- | ----------------------------------------------------------------------------- |
| `.`         | `createCamunda7Client` factory (basic / bearer / no auth) + schema re-exports |
| `./sdk`     | Generated SDK — one typed function per REST operation                         |
| `./types`   | Generated request/response types                                              |
| `./schemas` | Zod input schemas (see below)                                                 |

These four subpaths are the public API. The internal layout of the generated
output (`dist/generated/**`) is not — it may change with any `@hey-api/openapi-ts`
upgrade, so deep imports are deliberately not exported.

## Client behavior

SDK functions return the response payload directly (`responseStyle: "data"`)
and reject on HTTP error responses (`throwOnError: true`). Both options are
declared once in the generator config (`openapi-ts.config.ts`) and applied at
runtime through `createClientConfig` (`src/hey-api.ts`), which the generated
default client and `createCamunda7Client` share — generated types and runtime
behavior always agree.

```ts
import { createCamunda7Client } from "@miragon-ai/client-cibseven"
import { getProcessDefinitions } from "@miragon-ai/client-cibseven/sdk"

const client = createCamunda7Client({
  baseUrl: "http://localhost:8410/engine-rest",
  authType: "basic",
  username: "demo",
  password: "demo",
})
const definitions = await getProcessDefinitions({ client, query: { latestVersion: true } })
```

## OpenAPI spec — origin & refresh

The spec is checked in as `cibseven-open-api-doc.json` (currently reporting
`info.version` **2.1.2**). It originates from the engine's published OpenAPI
artifact `org.cibseven.bpm:cibseven-engine-rest-openapi` (a jar containing
`openapi.json`); Maven Central publishes the minor releases (2.1.0, 2.2.0, …).
The running engine does not serve its spec over HTTP, so the artifact is the
canonical source.

To refresh:

```bash
pnpm spec:refresh <version>   # e.g. pnpm spec:refresh 2.2.0 — downloads + extracts the spec
pnpm generate                 # regenerate src/generated from the new spec
git diff                      # review spec + SDK changes, run the repo verification suite
```

Commit the spec and the regenerated output together — `src/generated/` is
checked in and CI assumes it matches the spec.

## MCP-oriented input schemas

`src/schemas/` (exported as `./schemas`) are hand-written Zod schemas for the
MCP tools in `@miragon-ai/mcp-cibseven`: flat parameter objects with
LLM-friendly descriptions, sensible defaults, and conservative bounds. They
are intentionally narrower than the full REST API surface and are not
generated from the spec — they are the package's value-add for building MCP
tools on top of the raw SDK, and can be ignored by non-MCP consumers.
