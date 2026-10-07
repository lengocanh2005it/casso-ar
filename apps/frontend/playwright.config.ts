import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
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
    // Common Android width, and the narrowest that still fits six 44px OTP
    // boxes in the auth card. Shipping only 390 let a 304px OTP row overflow
    // here by 8px unnoticed.
    { name: 'phone-sm', use: { viewport: { width: 360, height: 800 } } },
    { name: 'md-edge', use: { viewport: { width: 767, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 900, height: 900 } } },
    { name: 'desktop', use: { viewport: { width: 1024, height: 900 } } },
  ],
  webServer: {
    command: 'pnpm turbo run dev --filter=@casso-ar/frontend',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
