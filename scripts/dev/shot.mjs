// Dev helper: log in and screenshot pages. node scripts/dev/shot.mjs /path ... (desktop+mobile)
import { chromium, devices } from '@playwright/test'
const base = 'http://localhost:3000'
const paths = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [name, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', devices['Pixel 7']]]) {
  const ctx = await browser.newContext({ ...opts, locale: 'de-DE', timezoneId: 'Europe/Berlin' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()))
  await page.goto(base + '/anmelden')
  await page.fill('#email', process.env.E2E_EMAIL ?? 'branko@prorendo.test')
  await page.fill('#password', process.env.E2E_PASSWORD ?? 'Test-Passwort-123')
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/anmelden'), { timeout: 20000 })
  for (const p of paths) {
    await page.goto(base + p)
    await page.waitForLoadState('networkidle')
    const file = `.local/shots/${name}${p.replace(/\//g, '_') || '_root'}.png`
    await page.screenshot({ path: file, fullPage: true })
    console.log(name, p, '->', page.url(), file)
  }
  await ctx.close()
}
await browser.close()
