# miravelo-upstream

Mock CRM/leasing upstream for the **Miravelo Leasing** showcase
(`examples/cibseven-example`). Standalone MCP server that ships its
own declarative pipeline step + remote-hosted widget bundle, modelled on the
[`customers-upstream` example](https://github.com/Miragon/mcp-toolkit/tree/main/examples/customers-upstream)
in `Miragon/mcp-toolkit`.

## What it exposes

| Tool                     | Purpose                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get-leasing-customer`   | Looks up `CUST-XXXXX` (= process instance `businessKey`). Returns customer + last leasing application. Synthesises a deterministic profile for unknown ids. |
| `list-leasing-customers` | Well-known seed customers — useful for picking demo IDs.                                                                                                    |
| `get-module-manifest`    | Advertises the declarative step + widget so the host registers them at boot.                                                                                |

Module manifest:

- step `miravelo:resolve-customer` — `requires: [miravelo:customerId]`,
  `produces: [miravelo:customer]`, calls `get-leasing-customer`.
- widget `miravelo:leasing-application` — `requires: [miravelo:customer]`,
  bundle served as `ui://miravelo/leasing-application.js`.

## Run

The repo's root `pnpm dev` orchestrates the upstream + host together — it
starts this server first, waits for `:4002`, then boots the host:

```sh
pnpm install
pnpm dev   # → starts miravelo-upstream + server, gated on TCP:4002
```

To run only the upstream:

```sh
pnpm --filter @miragon-ai/miravelo-upstream dev
# → [miravelo-upstream] listening on http://localhost:4002/mcp
```

Override the port via `UPSTREAM_MIRAVELO_PORT` in `.env`.

## Wire it into the host

Add the upstream to `MCP_PROXIES` in `.env`. The proxy entry must carry
`upstreamModules: true` — without that flag only the tools are federated, the
manifest with the declarative step + widget is _not_ discovered.

```env
# .env
UPSTREAM_MIRAVELO_PORT=4002
MCP_PROXIES=[{"name":"miravelo","label":"Miravelo","upstreamUrl":"http://localhost:4002/mcp","auth":{"mode":"none"},"upstreamModules":true}]
```

If you already have other entries in `MCP_PROXIES`, append to the JSON array.

At boot the host calls `get-module-manifest` on this upstream, registers the
step + widget, and routes `read-widget-bundle` requests for
`miravelo:leasing-application` back here. Federated tool names appear as
`miravelo_get-leasing-customer`, `miravelo_list-leasing-customers`.

## Use it as an extra tab

When viewing a `miraveloLeasing` instance, the LLM can compose a tabs
layout via `render-view` — Camunda's instance-detail tab plus the leasing
tab driven by the businessKey:

```jsonc
{
  "name": "render-view",
  "arguments": {
    "keys": {
      "camunda7:processInstanceId": "<instance-id>",
      "miravelo:customerId": "<businessKey>",
    },
    "steps": [
      { "id": "instance", "step": "camunda7:load-process-instance" },
      { "id": "customer", "step": "miravelo:resolve-customer" },
    ],
    "layout": {
      "tabs": [
        { "label": "Prozess", "rows": [{ "row": [{ "widget": "camunda7:instance-detail" }] }] },
        {
          "label": "Leasingantrag",
          "rows": [{ "row": [{ "widget": "miravelo:leasing-application" }] }],
        },
      ],
    },
  },
}
```

Since the seeder uses `businessKey == customerId`, the host can be told to
duplicate the `processInstance.businessKey` into `miravelo:customerId` —
or the LLM does it inline as above.
