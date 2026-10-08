import { expect, test } from '@playwright/test'
import { login } from './support'

const PAGES = ['/', '/aufgaben', '/unternehmen', '/kontakte', '/pipeline', '/discovery', '/discovery/validierung', '/aktivitaeten', '/assistent', '/einstellungen']

test('Kernseiten ohne seitliches Scrollen, App installierbar', async ({ page, request }, info) => {
  await login(page)
  for (const path of PAGES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).filter({ visible: true }).first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${path} (${info.project.name}) läuft seitlich über`).toBeLessThanOrEqual(0)
  }

  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ name: 'ReQover OS', lang: 'de-DE', display: 'standalone', start_url: '/' })
  for (const icon of manifest.icons as { src: string }[]) expect((await request.get(icon.src)).status()).toBe(200)
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1)
})
