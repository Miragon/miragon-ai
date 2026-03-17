import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

/**
 * Playwright global setup: ensures dist/ is built for prodResources e2e tests.
 * Skips the build if dist/ already contains resource HTML files.
 */
export default function globalSetup() {
  const distDir = resolve('dist');

  // Check if dist/ has at least one resource HTML file
  if (existsSync(distDir)) {
    const entries = readdirSync(distDir);
    const hasResourceHtml = entries.some((entry) => {
      return existsSync(resolve(distDir, entry, `${entry}.html`));
    });
    if (hasResourceHtml) {
      return; // Already built
    }
  }

  console.log('Building resources for prodResources e2e tests...');
  execSync('pnpm sunpeak build', { stdio: 'inherit' });
}
