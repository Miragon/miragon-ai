import { defineConfig } from "@playwright/test"

const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: ".",
  // Matches the .gitignore entry and the CI artifact upload.
  outputDir: "../test-results",
  // Boots the real server (built bundle) + stub engine + host backend once,
  // on ephemeral ports; see global-setup.ts.
  globalSetup: "./global-setup.ts",
  timeout: 45_000,
  // Every scenario owns its page and host log; the server is shared and only
  // ever read. Two workers in CI keep the timing scenarios (the 2.5 s
  // recovery grace) clear of CPU starvation on the runner.
  fullyParallel: true,
  workers: CI ? 2 : undefined,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    // The OS preference every scenario starts from — "dark host + light OS"
    // depends on it being light.
    colorScheme: "light",
    viewport: { width: 1000, height: 780 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
})
