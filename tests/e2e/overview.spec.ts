import { expect, test } from '@playwright/test'
import { expectToast, login, submitDialog, testName } from './support'

const berlinToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())

test('Übersicht priorisiert aus echten Daten, erklärt „Warum?“ und führt zur Vorbereitung', async ({ page }) => {
  const company = testName('Briefingfirma')
  await login(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /^Guten (Morgen|Tag|Abend)/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ProRendo Briefing' })).toBeVisible()

  // Unternehmen + Chance mit Wiedervorlage heute anlegen.
  await page.goto('/unternehmen?neu=1')
  await page.fill('#c-name', company)
  await submitDialog(page)
  await page.waitForURL(/\/unternehmen\/[0-9a-f-]{36}$/)
  const companyUrl = page.url()
  await page.getByRole('tab', { name: /Chancen/ }).click()
  await page.getByRole('button', { name: 'Neue Chance' }).click()
  await page.fill('#o-title', `Pilot ${company}`)
  await page.fill('#o-value', '3.000')
  await page.fill('#o-next', 'Rückruf Geschäftsführung')
  await page.fill('#o-next-date', berlinToday())
  await submitDialog(page)
  await expectToast(page, 'Chance angelegt.')

  // Die Übersicht zeigt die Wiedervorlage als priorisierte Aktion.
  await page.goto('/')
  const item = page.getByRole('listitem', { name: new RegExp(company) })
  await expect(item).toBeVisible()
  await expect(item.getByText('Rückruf Geschäftsführung')).toBeVisible()
  await expect(item.getByText('Wiedervorlage heute').first()).toBeVisible()
  await item.getByText('Warum?').click()
  await expect(item.getByText('Die vereinbarte Wiedervorlage ist heute.')).toBeVisible()
  await expect(item.getByRole('list', { name: 'Gewichtung' })).toContainText('+30')

  // Kennzahlen verlinken auf echte Seiten.
  await expect(page.getByRole('list', { name: 'Kennzahlen' }).getByRole('link', { name: /Pipeline/ })).toBeVisible()

  // Vorbereiten öffnet die Gesprächsvorbereitung.
  await item.getByRole('link', { name: `${company} vorbereiten` }).click()
  await page.waitForURL(/\/vorbereitung$/)
  await expect(page.getByRole('heading', { level: 1, name: company })).toBeVisible()
  // Next keeps the previous route mounted but hidden, so only count visible matches.
  await expect(page.getByText('Die vereinbarte Wiedervorlage ist heute.').filter({ visible: true })).toBeVisible()
  await expect(page.getByText(/Wenn Sie morgen für zwei Wochen/).filter({ visible: true })).toBeVisible()

  // Validierung ist erreichbar und zeigt nur echte Daten oder einen ehrlichen leeren Zustand.
  await page.goto('/discovery/validierung')
  await expect(page.getByRole('navigation', { name: 'Discovery-Bereiche' }).getByRole('link', { name: 'Validierung' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('Signale').or(page.getByText('Noch keine abgeschlossenen Gespräche')).filter({ visible: true }).first()).toBeVisible()

  // Aufräumen: Unternehmen löschen, damit die Übersicht anderer Läufe nicht wächst.
  page.on('dialog', (d) => d.accept())
  await page.goto(companyUrl)
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await page.getByRole('menuitem', { name: 'Unternehmen löschen' }).click()
  await page.waitForURL(/\/unternehmen$/)
})
