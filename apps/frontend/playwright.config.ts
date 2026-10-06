import { defineConfig } from '@playwright/test';

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    // Default is Playwright's bundled chromium (see `test:viewport:install`).
    // Set PLAYWRIGHT_CHANNEL to use a locally installed browser instead, for
    // networks that block cdn.playwright.dev.
    channel: process.env.PLAYWRIGHT_CHANNEL,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
    { name: 'md-edge', use: { viewport: { width: 767, height: 900 } } },
    { name: 'desktop', use: { viewport: { width: 1024, height: 900 } } },
  ],
  webServer: {
    command: 'pnpm turbo run dev --filter=@casso-ar/frontend',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
