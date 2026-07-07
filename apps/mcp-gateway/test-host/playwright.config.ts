import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  // Two scenarios against one static server — no parallel-worker gain, and a
  // single worker keeps the __hostLog assertions free of cross-test noise.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8788",
  },
  webServer: {
    command: "node serve.mjs",
    url: "http://127.0.0.1:8788/host-sim.html",
    reuseExistingServer: !process.env.CI,
  },
})
