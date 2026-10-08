import { expect, test } from '@playwright/test'
import { expectToast, login, testName } from './support'

// Runs against the dev server started with APP_ENV=test AI_PROVIDER=fake (see docs/status.md).
test('Assistent: Frage aus Daten beantworten, Aufgabe aus der Befehlsleiste vorschlagen und bestätigen', async ({ page }) => {
  const title = testName('Angebot nachfassen')
  await login(page)

  await page.goto('/assistent')
  await expect(page.getByText(/^Antworten beruhen nur auf deinen Daten/)).toBeVisible()
  const fresh = page.getByRole('button', { name: 'Neues Gespräch' })
  if (await fresh.isVisible()) {
    await fresh.click()
    await expect(fresh).toBeHidden()
  }
  await page.getByRole('button', { name: 'Was muss ich heute machen?' }).click()
  await expect(page.getByText(/^Testmodus: /).first()).toBeVisible()
  await expect(page.getByText('Datenbasis: Priorisierung')).toBeVisible()

  // Free text in the command bar goes to the assistant; the change is only proposed.
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Suchen, Aktion wählen oder ReQover fragen …').fill(`Lege eine Aufgabe an: ${title} für morgen`)
  await page.getByRole('option', { name: /ReQover fragen/ }).click()
  const card = page.getByRole('region', { name: 'Vorgeschlagene Änderungen' }).filter({ hasText: title })
  await expect(card.getByText('Ich würde folgende Änderungen durchführen:')).toBeVisible()
  await expect(page).toHaveURL(/\/assistent$/)

  await page.goto('/aufgaben')
  await expect(page.getByText(title)).toHaveCount(0)
  await page.goto('/assistent')
  await card.getByRole('button', { name: 'Übernehmen' }).click()
  await expectToast(page, 'Änderungen übernommen.')
  await expect(card.getByText('Vorschlag · Übernommen')).toBeVisible()

  await page.goto('/aufgaben')
  await expect(page.getByText(title).filter({ visible: true }).first()).toBeVisible()
})
