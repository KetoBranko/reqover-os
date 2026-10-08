import { expect, type Page } from '@playwright/test'

export const E2E_EMAIL = process.env.E2E_EMAIL ?? 'e2e@reqover.test'
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2E-Passwort-123'

export async function login(page: Page) {
  await page.goto('/anmelden')
  await page.fill('#email', E2E_EMAIL)
  await page.fill('#password', E2E_PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/anmelden'), { timeout: 20_000 })
}

/** Unique, clearly fictional name so runs never collide and never look like real firms. */
export function testName(prefix: string) {
  return `${prefix} E2E ${Date.now().toString(36)}`
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

export async function submitDialog(page: Page) {
  await page.getByRole('dialog').locator('button[type=submit]').click()
}
