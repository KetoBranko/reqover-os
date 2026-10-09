import { expect, test } from '@playwright/test'
import { expectToast, login, submitDialog, testName } from './support'

test('Einstellungen: Pilotangebot ändern, Änderungsprotokoll, Export', async ({ page }) => {
  const company = testName('Protokollfirma')
  page.on('dialog', (d) => d.accept())
  await login(page)

  await page.goto('/unternehmen?neu=1')
  await page.fill('#c-name', company)
  await submitDialog(page)
  await page.waitForURL(/\/unternehmen\/[0-9a-f-]{36}$/)
  const companyUrl = page.url()

  await page.goto('/einstellungen')
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Stufe 2: Vorschlagen/ })).toBeChecked()
  const weeks = page.getByLabel('Laufzeit (Wochen)')
  const before = await weeks.inputValue()
  const next = before === '6' ? '7' : '6'
  await weeks.fill(next)
  await page.getByRole('button', { name: 'Pilotangebot speichern' }).click()
  await expectToast(page, 'Pilotangebot gespeichert.')
  await page.reload()
  await expect(page.getByLabel('Laufzeit (Wochen)')).toHaveValue(next)

  // Export is a real download of the organisation's data.
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: /Alle Daten exportieren/ }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^prorendo-export-\d{4}-\d{2}-\d{2}\.json$/)

  await page.getByRole('link', { name: 'Änderungsprotokoll' }).click()
  await page.waitForURL(/\/einstellungen\/protokoll$/)
  await page.getByRole('group', { name: 'Bereich' }).filter({ visible: true }).getByRole('link', { name: 'Unternehmen', exact: true }).click()
  await page.waitForURL(/bereich=companies/)
  await expect(page.getByText(`„${company}“`).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('Unternehmen angelegt').filter({ visible: true }).first()).toBeVisible()

  await page.goto(companyUrl)
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await page.getByRole('menuitem', { name: 'Unternehmen löschen' }).click()
  await page.waitForURL(/\/unternehmen$/)
})
