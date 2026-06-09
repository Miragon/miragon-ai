import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig({
  input: "./cibseven-open-api-doc.json",
  output: { path: "./src/generated", module: { extension: ".js" } },
  plugins: ["@hey-api/typescript", "@hey-api/sdk", "@hey-api/client-fetch"],
})
