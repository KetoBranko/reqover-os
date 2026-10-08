import { expect, test } from '@playwright/test'
import { expectToast, login, submitDialog, testName } from './support'

test('Chance anlegen, verschieben, gewinnen nur mit Auftrag, verlieren nur mit Grund', async ({ page, isMobile }) => {
  const company = testName('Pipefirma')
  page.on('dialog', (d) => d.accept())
  await login(page)

  await page.goto('/unternehmen?neu=1')
  await page.fill('#c-name', company)
  await submitDialog(page)
  await page.waitForURL(/\/unternehmen\/[0-9a-f-]{36}$/)

  // Chance vom Unternehmen aus anlegen.
  await page.getByRole('tab', { name: /Chancen/ }).click()
  await page.getByRole('button', { name: 'Neue Chance' }).click()
  await page.fill('#o-title', `Pilot ${company}`)
  await page.fill('#o-value', '2.500')
  await page.fill('#o-next', 'Discovery vereinbaren')
  await submitDialog(page)
  await expectToast(page, 'Chance angelegt.')
  await expect(page.getByRole('tabpanel').getByText('2.500,00 €')).toBeVisible()

  await page.goto(`/pipeline?q=${encodeURIComponent(company)}`)
  const title = `Pilot ${company}`

  async function moveTo(stage: string) {
    if (isMobile) {
      await page.getByLabel(`Phase von ${title}`, { exact: true }).selectOption({ label: stage })
    } else if (stage !== 'Kontaktiert') {
      await page.getByRole('button', { name: `Phase von ${title} ändern` }).click()
      await page.getByRole('menuitem', { name: stage }).click()
    } else {
      const handle = page.getByRole('button', { name: `${title} verschieben` })
      const target = page.getByRole('region', { name: stage })
      await handle.hover()
      await page.mouse.down()
      const box = (await target.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + 80, { steps: 12 })
      await page.mouse.up()
    }
  }

  // Desktop: real drag into the neighbouring column; elsewhere the menu/select.
  await moveTo('Kontaktiert')
  await expectToast(page, `${title} → Kontaktiert`)
  await moveTo('Angebot')
  await expectToast(page, `${title} → Angebot`)

  // Gewonnen ohne Auftrag → Datenqualitäts-Dialog.
  await moveTo('Gewonnen')
  const won = page.getByRole('dialog', { name: /als Gewonnen markieren/ })
  await expect(won).toBeVisible()
  await won.getByRole('button', { name: 'Abbrechen' }).click()
  await expect(won).toBeHidden()

  // Verloren verlangt Grund.
  await moveTo('Verloren')
  const lost = page.getByRole('dialog', { name: /als Verloren markieren/ })
  await lost.getByRole('button', { name: 'Als verloren speichern' }).click()
  await expect(lost.getByText(/Bitte einen Grund angeben/)).toBeVisible()
  await lost.getByRole('button', { name: 'Kein Budget' }).click()
  await lost.getByRole('button', { name: 'Als verloren speichern' }).click()
  await expectToast(page, `${title} → Verloren`)

  // Nach Reload: Phase und Grund sind gespeichert, Verlauf dokumentiert.
  await page.reload()
  await expect(page.getByText('Grund: Kein Budget').filter({ visible: true })).toBeVisible()
  await page.goto(`/aktivitaeten?q=${encodeURIComponent('Verloren')}`)
  await expect(page.getByText(`${title}: Angebot → Verloren`)).toBeVisible()
})
