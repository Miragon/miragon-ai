import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig({
  input: "./cibseven-open-api-doc.json",
  output: { path: "./src/generated", module: { extension: ".js" } },
  plugins: [
    "@hey-api/typescript",
    // `responseStyle: "data"` + `throwOnError: true` are declared here (not in
    // the hand-written factory) so the generated SDK signatures and the runtime
    // behavior come from the same source: SDK functions return the payload
    // directly and reject on HTTP errors.
    { name: "@hey-api/sdk", responseStyle: "data" },
    {
      name: "@hey-api/client-fetch",
      throwOnError: true,
      // Runtime defaults (headers, throwOnError, responseStyle) shared by the
      // generated default client and `createCamunda7Client` — see src/hey-api.ts.
      // The specifier is emitted verbatim into src/generated/client.gen.ts, so
      // it must be relative to the generated output root (and use the build's
      // `.js` module extension).
      runtimeConfigPath: "../hey-api.js",
    },
  ],
})
