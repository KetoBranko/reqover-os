import { expect, test } from '@playwright/test'
import { expectToast, login, submitDialog, testName } from './support'

// Runs against the dev server started with APP_ENV=test AI_PROVIDER=fake (see docs/status.md).
test('Gespräch analysieren → Prüfbildschirm → Auswahl bearbeiten und übernehmen', async ({ page }) => {
  const company = testName('AIfirma')
  page.on('dialog', (d) => d.accept())
  await login(page)

  await page.goto('/unternehmen?neu=1')
  await page.fill('#c-name', company)
  await submitDialog(page)
  await page.waitForURL(/\/unternehmen\/[0-9a-f-]{36}$/)
  const companyUrl = page.url()

  await page.goto('/discovery?neu=1')
  await page.getByLabel('Unternehmen').selectOption({ label: company })
  await submitDialog(page)
  await page.waitForURL(/\/gespraech$/)
  await page.getByRole('button', { name: /Gespräch beenden|Beenden/ }).click()
  await page.waitForURL(/\/discovery\/[0-9a-f-]{36}$/)
  const discoveryUrl = page.url()

  // Type and analyse right away: the pending autosave is flushed first.
  await page
    .getByLabel('Gesprächsnotizen')
    .fill('Gespräch mit Thomas war gut. Die machen ungefähr 30 bis 40 Angebote im Monat. Nachverfolgung macht jeder Außendienstler selbst, da bleiben Sachen liegen. Ich soll ihn nächste Woche anrufen.')
  await page.getByRole('button', { name: 'Gespräch analysieren' }).click()
  await page.waitForURL(/\/auswertung\/[0-9a-f-]{36}$/)

  await expect(page.getByRole('heading', { level: 1, name: 'Ich habe folgende Informationen erkannt.' })).toBeVisible()
  await expect(page.getByText('Noch ist nichts gespeichert.')).toBeVisible()
  await expect(page.getByText('Unsichere Angabe').first()).toBeVisible()
  await expect(page.getByText('„Nachverfolgung macht jeder Außendienstler selbst, da bleiben Sachen liegen.“').first()).toBeVisible()

  // Bearbeiten: Zusammenfassung abwählen, Aufgabe umbenennen.
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await page.getByRole('checkbox', { name: 'Übernehmen: Zusammenfassung' }).uncheck()
  await page.getByLabel('Aufgabe: Titel').fill(`Thomas anrufen ${company}`)
  await page.getByRole('button', { name: /^Auswahl übernehmen/ }).click()
  await page.waitForURL(discoveryUrl)
  await expectToast(page, /Änderungen übernommen/)

  // Persistiert: Zusammenfassung leer, Hauptschmerz gesetzt, Evidence bestätigt, Antwort gespeichert.
  await page.reload()
  await expect(page.getByLabel('Zusammenfassung')).toHaveValue('')
  await expect(page.getByLabel('Hauptschmerz')).toHaveValue(/bleiben Sachen liegen/)
  await expect(page.getByRole('tab', { name: 'Evidence Score · 2/20' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Fragen · 1\// })).toBeVisible()

  // Aufgabe mit Herkunft AI und Verlaufseintrag „vorgeschlagen durch ReQover AI, bestätigt durch dich“.
  await page.goto('/aufgaben')
  await expect(page.getByText(`Thomas anrufen ${company}`).filter({ visible: true })).toBeVisible()
  await page.goto(companyUrl)
  await page.getByRole('tab', { name: 'Aktivitäten' }).click()
  await expect(page.getByText(/AI-Vorschlag übernommen: \d+ von \d+ Änderungen/).filter({ visible: true })).toBeVisible()
  await expect(page.getByText(/bestätigt durch dich/).filter({ visible: true })).toBeVisible()

  await page.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await page.getByRole('menuitem', { name: 'Unternehmen löschen' }).click()
  await page.waitForURL(/\/unternehmen$/)
})
