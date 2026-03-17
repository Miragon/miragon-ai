import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.SUNPEAK_TEST_PORT || 6776);

export default defineConfig({
  globalSetup: './tests/e2e/global-setup.ts',
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-gl=angle'],
        },
      },
    },
  ],
  webServer: {
    command: `PORT=${port} pnpm dev`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
