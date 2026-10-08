import { expect, test } from '@playwright/test'
import { expectToast, login, submitDialog, testName } from './support'

// Phase 3: core CRM objects are created through the UI and survive a reload.
test('Unternehmen, Kontakt, Aufgabe und Notiz anlegen und nach Reload wiederfinden', async ({ page }) => {
  const company = testName('Testfirma')
  const task = `Rückruf ${company}`
  const note = `Erstgespräch mit ${company}: Backlog bei Angeboten bestätigt.`
  page.on('dialog', (d) => d.accept())

  await login(page)

  // Unternehmen
  await page.goto('/unternehmen?neu=1')
  await page.fill('#c-name', company)
  await page.fill('#c-industry', 'Maschinenbau')
  await submitDialog(page)
  await page.waitForURL(/\/unternehmen\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: company })).toBeVisible()
  const companyUrl = page.url()

  // Kontakt
  await page.getByRole('tab', { name: /Kontakte/ }).click()
  await page.getByRole('button', { name: 'Neuer Kontakt' }).click()
  await page.fill('#k-first', 'Erika')
  await page.fill('#k-last', 'Testperson')
  await page.fill('#k-email', 'erika@example.invalid')
  await submitDialog(page)
  await expectToast(page, /Kontakt/)
  await expect(page.getByRole('tabpanel').getByText('Erika Testperson')).toBeVisible()

  // Aufgabe
  await page.getByRole('button', { name: 'Aufgabe', exact: true }).click()
  await page.fill('#t-title', task)
  await submitDialog(page)
  await expectToast(page, /Aufgabe/)

  // Notiz
  await page.getByRole('button', { name: 'Notiz', exact: true }).click()
  await page.fill('#a-body', note)
  await submitDialog(page)
  await expectToast(page, 'Gespeichert.')

  // Reload: everything is persisted.
  await page.goto(companyUrl)
  await page.getByRole('tab', { name: /Kontakte · 1/ }).click()
  await expect(page.getByRole('tabpanel').getByText('Erika Testperson')).toBeVisible()
  await page.getByRole('tab', { name: /Aufgaben · 1/ }).click()
  await expect(page.getByRole('tabpanel').getByText(task)).toBeVisible()
  await page.getByRole('tab', { name: 'Aktivitäten' }).click()
  await expect(page.getByRole('tabpanel').getByText(note)).toBeVisible()

  // Global lists show the new records.
  await page.goto(`/unternehmen?q=${encodeURIComponent(company)}`)
  await expect(page.getByText(company).filter({ visible: true }).first()).toBeVisible()
  await page.goto('/aufgaben')
  await expect(page.getByText(task).filter({ visible: true }).first()).toBeVisible()

  // Aufgabe erledigen → Aktivität im Verlauf
  await page.getByRole('listitem').filter({ hasText: task }).getByRole('button', { name: 'Als erledigt markieren' }).click()
  await expectToast(page, 'Erledigt.')
  await page.goto(`/aktivitaeten?q=${encodeURIComponent(company)}`)
  await expect(page.getByText(note)).toBeVisible()

  // Befehlsleiste: globale Suche führt zum Unternehmen.
  await page.goto('/aufgaben')
  await page.getByRole('button', { name: /Was möchtest du tun/ }).click()
  await page.getByPlaceholder(/Suchen, Aktion wählen/).fill(company.slice(-12))
  await page.getByRole('option', { name: new RegExp(company) }).click()
  await page.waitForURL(companyUrl)

  // Schnellaktion öffnet den Anlage-Dialog.
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByPlaceholder(/Suchen, Aktion wählen/).fill('Neue Aufgabe')
  await expect(page.getByRole('option', { name: 'Neue Aufgabe anlegen' })).toHaveAttribute('data-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/aufgaben\?neu=/)
  await expect(page.getByRole('dialog', { name: 'Neue Aufgabe' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Aufräumen: Unternehmen inkl. abhängiger Daten löschen.
  await page.goto(companyUrl)
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await page.getByRole('menuitem', { name: 'Unternehmen löschen' }).click()
  await page.waitForURL(/\/unternehmen$/)
  await page.goto(companyUrl)
  await expect(page.getByText(/existiert nicht|nicht gefunden/i).first()).toBeVisible()
})
