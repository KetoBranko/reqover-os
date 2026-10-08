import { expect, test } from '@playwright/test'

test('Sicherheits-Header und geschützte Endpunkte', async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL })
  const page = await anon.get('/anmelden')
  const h = page.headers()
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(h['content-security-policy']).toContain("object-src 'none'")
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['permissions-policy']).toContain('microphone=(self)')
  expect(h['x-powered-by']).toBeUndefined()

  // Without a session nothing leaks: pages redirect to login, APIs refuse.
  const app = await anon.get('/unternehmen', { maxRedirects: 0 })
  expect(app.status()).toBe(307)
  expect(app.headers()['location']).toContain('/anmelden')
  const exp = await anon.get('/api/export', { maxRedirects: 0 })
  expect([307, 401]).toContain(exp.status())
  expect(await exp.text()).not.toContain('"unternehmen"')
  await anon.dispose()
})
