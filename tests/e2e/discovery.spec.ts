import { expect, test } from '@playwright/test'
import { expectToast, login, submitDialog, testName } from './support'

test('Discovery: Gesprächsmodus, Fragen, Evidence Score, Evidenz vs. Interpretation, Abschluss', async ({ page }) => {
  const company = testName('Discofirma')
  page.on('dialog', (d) => d.accept())
  await login(page)

  await page.goto('/unternehmen?neu=1')
  await page.fill('#c-name', company)
  await submitDialog(page)
  await page.waitForURL(/\/unternehmen\/[0-9a-f-]{36}$/)

  // Start from the Discovery area.
  await page.goto('/discovery?neu=1')
  await page.getByLabel('Unternehmen').selectOption({ label: company })
  await submitDialog(page)
  await page.waitForURL(/\/discovery\/[0-9a-f-]{36}\/gespraech$/)
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toHaveCount(0)

  await page.getByLabel('Antwort möglichst wörtlich').fill('Die 60 alten Angebote aus dem letzten Jahr.')
  await page.getByLabel('Notizen').fill('Innendienst überlastet. Nachfassen macht jeder selbst.')
  await page.getByLabel('Wie viele Angebote erstellen Sie ungefähr pro Monat?').fill('30 bis 40')
  await page.getByLabel('Wie viele Angebote erstellen Sie ungefähr pro Monat?').blur()
  await expect(page.getByText('Gespeichert').first()).toBeVisible()
  await page.getByRole('button', { name: /Gespräch beenden|Beenden/ }).click()
  await page.waitForURL(/\/discovery\/[0-9a-f-]{36}$/)
  const url = page.url()

  // Reload: notes and answers persisted.
  await page.reload()
  await expect(page.getByLabel('Gesprächsnotizen')).toHaveValue('Innendienst überlastet. Nachfassen macht jeder selbst.')
  await page.getByRole('tab', { name: /Fragen/ }).click()
  await expect(page.getByLabel('Wie viele Angebote erstellen Sie ungefähr pro Monat?')).toHaveValue('30 bis 40')

  // Evidence Score + signals.
  await page.getByRole('tab', { name: /Evidence Score/ }).click()
  await page.getByRole('radiogroup', { name: 'Problem: Punkte', exact: true }).getByRole('radio', { name: /^2 Punkte/ }).click()
  await page.getByLabel('Problem: Kundenaussage', { exact: true }).fill('„Wir haben bestimmt 60 alte Angebote.“')
  await page.getByRole('radiogroup', { name: 'Budget: Punkte', exact: true }).getByRole('radio', { name: /^1 Punkt:/ }).click()
  await page.getByRole('radiogroup', { name: 'Problem bestätigt', exact: true }).getByRole('button', { name: 'Ja' }).click()
  await expect(page.getByText('3/20').first()).toBeVisible()

  // Evidence vs interpretation.
  await page.getByRole('tab', { name: 'Evidenz vs. Interpretation' }).click()
  await page.getByLabel('Was hat der Kunde gesagt?: neuer Eintrag').fill('„Das bleibt bei uns einfach liegen.“')
  await page.getByRole('button', { name: 'Was hat der Kunde gesagt?: hinzufügen' }).click()
  await page.getByLabel('Was interpretieren wir daraus?: neuer Eintrag').fill('Kapazität ist die Ursache, nicht fehlender Wille.')
  await page.getByRole('button', { name: 'Was interpretieren wir daraus?: hinzufügen' }).click()
  await expect(page.getByText('„Das bleibt bei uns einfach liegen.“')).toBeVisible()

  await page.getByRole('button', { name: 'Abschließen' }).click()
  await expectToast(page, /Discovery abgeschlossen/)

  await page.goto(url)
  await expect(page.getByText('Abgeschlossen', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Evidence Score · 3/20' })).toBeVisible()

  // Timeline and list reflect it.
  await page.goto('/discovery')
  await expect(page.getByText(company).first()).toBeVisible()
  await page.goto('/aktivitaeten')
  await expect(page.getByText('Discovery-Gespräch abgeschlossen').first()).toBeVisible()
})
