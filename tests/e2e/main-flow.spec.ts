import { expect, test, type Page } from '@playwright/test'
import { expectToast, login, submitDialog, testName } from './support'

// Spec 41: the main user flow from the morning briefing to the reminder on the next day.
// Runs against `npm run dev:e2e` (AI, speech and the clock cookie are test doubles there).
const DICTATED = 'Testmodus-Diktat: Die machen ungefähr 30 bis 40 Angebote im Monat.'
const berlinDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(Date.now() + offset * 86_400_000))

async function pipelineCount(page: Page) {
  await page.goto('/')
  const hint = await page.getByRole('list', { name: 'Kennzahlen' }).getByRole('link', { name: /Pipeline/ }).innerText()
  return Number(/(\d+) offene/.exec(hint)?.[1] ?? NaN)
}

test('Haupt-Flow: Briefing → Unternehmen → Vorbereitung → Gespräch → Diktat → AI-Prüfung → Bestätigung → Erinnerung am nächsten Tag', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000)
  const company = testName('Flowfirma')
  const callTask = `Thomas anrufen wegen ${company}`
  page.on('dialog', (d) => d.accept())
  await login(page)
  const pipelineBefore = await pipelineCount(page)

  // Ausgangslage: Unternehmen mit Fakt, Hypothese und einer heute fälligen Aufgabe.
  await page.goto('/unternehmen?neu=1')
  await page.fill('#c-name', company)
  await page.fill('#c-industry', 'Sondermaschinenbau')
  await submitDialog(page)
  await page.waitForURL(/\/unternehmen\/[0-9a-f-]{36}$/)
  const companyUrl = page.url()
  await page.getByRole('button', { name: 'Fakt hinzufügen' }).click()
  await page.fill('#i-statement', 'Fertigt kundenspezifische Anlagen in Einzelfertigung.')
  await submitDialog(page)
  await page.getByRole('button', { name: 'Hypothese hinzufügen' }).click()
  await page.fill('#i-statement', 'Lange Angebotsphasen führen zu liegengebliebenen Angeboten.')
  await submitDialog(page)
  await page.getByRole('button', { name: 'Aufgabe', exact: true }).click()
  await page.fill('#t-title', `Gespräch vorbereiten ${company}`)
  await page.fill('#t-due', berlinDay())
  await submitDialog(page)
  await expectToast(page, /Aufgabe/)

  // 1–2: ReQover öffnen, das Briefing zeigt die Priorität.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'ReQover Briefing' })).toBeVisible()
  const item = page.getByRole('listitem', { name: new RegExp(company) })
  await expect(item).toBeVisible()
  await expect(item.getByText(`Gespräch vorbereiten ${company}`).first()).toBeVisible()

  // 3–4: Unternehmen öffnen: Fakten, Hypothesen, bisheriger Verlauf.
  await item.getByRole('link', { name: `${company} öffnen` }).click()
  await page.waitForURL(companyUrl)
  const main = page.getByRole('main').filter({ visible: true })
  await expect(main.getByText('Fertigt kundenspezifische Anlagen in Einzelfertigung.')).toBeVisible()
  await expect(main.getByText('Lange Angebotsphasen führen zu liegengebliebenen Angeboten.')).toBeVisible()
  await page.getByRole('tab', { name: 'Aktivitäten' }).click()
  await expect(page.getByRole('tabpanel').filter({ visible: true })).toBeVisible()

  // 5: Gespräch vorbereiten.
  await page.getByRole('link', { name: 'Vorbereiten' }).click()
  await page.waitForURL(/\/vorbereitung$/)
  await expect(page.getByText('Lange Angebotsphasen führen zu liegengebliebenen Angeboten.').filter({ visible: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Discovery starten' }).filter({ visible: true }).click()
  await submitDialog(page)

  // 6: Gespräch führen.
  await page.waitForURL(/\/discovery\/[0-9a-f-]{36}\/gespraech$/)
  await expect(page.getByRole('timer')).toBeVisible()
  await page.getByLabel('Antwort möglichst wörtlich').fill('Die alten Angebote aus dem letzten Quartal.')
  await page.getByLabel('Antwort möglichst wörtlich').blur()
  await expect(page.getByText('Gespeichert').first()).toBeVisible()
  await page.getByRole('button', { name: /Gespräch beenden|Beenden/ }).click()
  await page.waitForURL(/\/discovery\/[0-9a-f-]{36}$/)
  const discoveryUrl = page.url()

  // 7: Zusammenfassung schreiben und diktieren.
  const notes = page.getByLabel('Gesprächsnotizen')
  await notes.fill(`Nachverfolgung macht jeder Außendienstler selbst, da bleiben Sachen liegen. Ich soll ${callTask}. Ein Pilot klingt interessant.`)
  await page.getByRole('button', { name: 'Notiz diktieren' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Mikrofon an' })).toBeVisible()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Diktat beenden' }).click()
  await expect(notes).toHaveValue(new RegExp(`${DICTATED}$`))

  // 8–10: AI extrahiert, zeigt den Prüfbildschirm und begründet den Evidence Score.
  await page.getByRole('button', { name: 'Gespräch analysieren' }).click()
  await page.waitForURL(/\/auswertung\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Ich habe folgende Informationen erkannt.' })).toBeVisible()
  await expect(page.getByText('Noch ist nichts gespeichert.')).toBeVisible()
  await expect(page.getByText(/2\/2 · Der Kunde benennt das Problem selbst\./).first()).toBeVisible()
  await expect(page.getByText(/30–40 Angebote pro Monat/).first()).toBeVisible()
  await expect(page.getByText(/Pilot: Angebots-Recovery/).first()).toBeVisible()

  // 11: bestätigen.
  await page.getByRole('button', { name: 'Alles übernehmen' }).click()
  await page.waitForURL(discoveryUrl)
  await expectToast(page, /Änderungen übernommen/)

  // 12: Discovery gespeichert.
  await page.reload()
  await expect(page.getByLabel('Hauptschmerz')).toHaveValue(/bleiben Sachen liegen/)
  await expect(page.getByRole('tab', { name: /Evidence Score · 2\/20/ })).toBeVisible()

  // 13–14: Unternehmen und Verlauf aktualisiert.
  await page.goto(companyUrl)
  await expect(page.getByRole('main').filter({ visible: true }).getByText(/30–40 Angebote pro Monat/).first()).toBeVisible()
  await page.getByRole('tab', { name: 'Aktivitäten' }).click()
  await expect(page.getByText(/AI-Vorschlag übernommen/).filter({ visible: true }).first()).toBeVisible()

  // 15: Aufgabe erstellt, fällig morgen.
  await page.getByRole('tab', { name: /Aufgaben/ }).click()
  await expect(page.getByRole('tabpanel').filter({ visible: true }).getByText(callTask)).toBeVisible()

  // 16: Chance vorgeschlagen und angelegt.
  await page.getByRole('tab', { name: /Chancen · 1/ }).click()
  await expect(page.getByRole('tabpanel').filter({ visible: true }).getByText('Pilot: Angebots-Recovery')).toBeVisible()

  // 17: Dashboard aktualisiert sich.
  expect(await pipelineCount(page)).toBe(pipelineBefore + 1)

  // 18: Am nächsten Tag erinnert das Briefing an den nächsten Schritt (heute ist die Aufgabe noch nicht fällig).
  await page.goto('/')
  await expect(page.getByRole('listitem', { name: new RegExp(company) }).getByText(callTask)).toHaveCount(0)
  await context.addCookies([{ name: 'reqover-testzeit', value: `${berlinDay(1)}T10:00:00Z`, url: baseURL! }])
  await page.goto('/')
  const tomorrow = page.getByRole('listitem', { name: new RegExp(company) })
  await expect(tomorrow).toBeVisible()
  await expect(tomorrow.getByText(callTask).first()).toBeVisible()
  await expect(tomorrow.getByRole('list', { name: 'Gründe' })).toContainText('Aufgabe seit gestern überfällig')
  await context.clearCookies({ name: 'reqover-testzeit' })

  // Aufräumen.
  await page.goto(companyUrl)
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await page.getByRole('menuitem', { name: 'Unternehmen löschen' }).click()
  await page.waitForURL(/\/unternehmen$/)
})
