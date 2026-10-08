import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env.PW_CHROMIUM_PATH ?? (process.env.CI ? undefined : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
