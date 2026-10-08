// Seeds clearly marked, fictional demo data into one organization (development only).
// Every row has is_demo = true, so the UI shows a permanent demo banner and the data
// can be removed again with --remove. Company names are invented; none is a real firm.
// Usage: npm run db:seed:demo -- --email branko@reqover.test [--remove]
import postgres from 'postgres'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { email: { type: 'string' }, remove: { type: 'boolean', default: false } } })
if (process.env.APP_ENV === 'production') {
  console.error('Demo-Daten sind in Produktion nicht erlaubt.')
  process.exit(1)
}
if (!values.email) {
  console.error('Bitte --email des Benutzers angeben, in dessen Organisation die Demo-Daten sollen.')
  process.exit(1)
}
const sql = postgres(process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })

const [member] = await sql`select u.id as user_id, m.organization_id from auth.users u
  join public.memberships m on m.user_id = u.id where u.email = ${values.email} limit 1`
if (!member) {
  console.error(`Kein Benutzer mit Organisation für ${values.email} gefunden.`)
  process.exit(1)
}
const org = member.organization_id as string
const userId = member.user_id as string

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d)
}
const at = (offset: number, hour = 10) => new Date(`${day(offset)}T${String(hour).padStart(2, '0')}:00:00+02:00`)

await sql.begin(async (tx) => {
  // Run as the user so RLS, audit actor and created_by are real.
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true),
                  set_config('role', 'authenticated', true), set_config('app.actor', 'system', true)`

  const removed = await tx`delete from public.companies where organization_id = ${org} and is_demo returning id`
  if (values.remove) {
    console.log(`${removed.length} Demo-Unternehmen samt abhängiger Daten entfernt.`)
    return
  }

  const companies = [
    { key: 'nordwerk', name: 'Nordwerk Anlagenbau', industry: 'Anlagenbau', city: 'Bremen', status: 'qualified', fit: 82, emp: 240, quote: true, project: true, source: 'Messe', uc: 'Rund 120 offene Angebote älter als 60 Tage, kein Nachfassprozess.' },
    { key: 'brandt', name: 'Brandt & Söhne Fensterbau', industry: 'Bauelemente', city: 'Kassel', status: 'researched', fit: 64, emp: 85, quote: true, project: false, source: 'Empfehlung', uc: null },
    { key: 'helios', name: 'Helios Klimatechnik', industry: 'TGA', city: 'Leipzig', status: 'qualified', fit: 74, emp: 160, quote: true, project: true, source: 'LinkedIn', uc: 'Eingeschlafene Projekte nach Planungsphase.' },
    { key: 'kranich', name: 'Kranich Fördertechnik', industry: 'Maschinenbau', city: 'Augsburg', status: 'researched', fit: null, emp: null, quote: null, project: null, source: 'Recherche', uc: null },
    { key: 'seeberg', name: 'Seeberg Laborbedarf', industry: 'Großhandel', city: 'Konstanz', status: 'not_a_fit', fit: 20, emp: 30, quote: false, project: false, source: 'Kaltakquise', uc: null },
  ] as const

  const ids: Record<string, string> = {}
  for (const c of companies) {
    const [row] = await tx`insert into public.companies
      (organization_id, name, industry, city, status, fit_score, employee_count, has_quote_business, has_project_business, source, recovery_use_case, is_demo, created_by)
      values (${org}, ${c.name}, ${c.industry}, ${c.city}, ${c.status}, ${c.fit}, ${c.emp}, ${c.quote}, ${c.project}, ${c.source}, ${c.uc}, true, ${userId})
      returning id`
    ids[c.key] = row!.id
  }

  const contacts = [
    { key: 'meyer', company: 'nordwerk', first: 'Jana', last: 'Meyerhoff', title: 'Vertriebsleiterin', role: 'decision_maker', rel: 'in_conversation' },
    { key: 'okon', company: 'nordwerk', first: 'Piotr', last: 'Okoń', title: 'Innendienst', role: 'user', rel: 'contacted' },
    { key: 'brandt', company: 'brandt', first: 'Felix', last: 'Brandt', title: 'Geschäftsführer', role: 'decision_maker', rel: 'new' },
    { key: 'arslan', company: 'helios', first: 'Derya', last: 'Arslan', title: 'Leiterin Projektvertrieb', role: 'champion', rel: 'trusted' },
    { key: 'vogt', company: 'helios', first: 'Martin', last: 'Vogt', title: 'Kaufmännischer Leiter', role: 'budget_owner', rel: 'contacted' },
  ] as const
  const cids: Record<string, string> = {}
  for (const k of contacts) {
    const [row] = await tx`insert into public.contacts
      (organization_id, company_id, first_name, last_name, job_title, decision_role, relationship_status, email, is_demo, created_by)
      values (${org}, ${ids[k.company]!}, ${k.first}, ${k.last}, ${k.title}, ${k.role}, ${k.rel}, ${`${k.first.toLowerCase()}@demo.invalid`}, true, ${userId})
      returning id`
    cids[k.key] = row!.id
  }

  const tasks = [
    { title: 'Jana Meyerhoff: Discovery-Termin bestätigen', company: 'nordwerk', contact: 'meyer', due: -2, prio: 'high', ctx: 'Termin wurde mündlich zugesagt, aber nicht bestätigt.' },
    { title: 'Pilotumfang mit Derya Arslan abstimmen', company: 'helios', contact: 'arslan', due: 0, prio: 'high', ctx: 'Sie will vor Quartalsende entscheiden.' },
    { title: 'Felix Brandt erstmals anrufen', company: 'brandt', contact: 'brandt', due: 1, prio: 'normal', ctx: 'Empfehlung durch Nordwerk.' },
    { title: 'Ansprechpartner bei Kranich recherchieren', company: 'kranich', contact: null, due: 5, prio: 'low', ctx: null },
    { title: 'Datenschutzfragen für Helios vorbereiten', company: 'helios', contact: 'vogt', due: null, prio: 'normal', ctx: 'Kaufmännischer Leiter fragt nach CRM-Zugriff.' },
  ] as const
  for (const t of tasks) {
    await tx`insert into public.tasks (organization_id, title, context, due_date, priority, company_id, contact_id, assignee_id, is_demo, created_by)
      values (${org}, ${t.title}, ${t.ctx}, ${t.due == null ? null : day(t.due)}, ${t.prio}, ${ids[t.company]!}, ${t.contact ? cids[t.contact]! : null}, ${userId}, true, ${userId})`
  }

  const activities = [
    { type: 'call', title: 'Erstgespräch Jana Meyerhoff', body: 'Sie bestätigt: Viele Angebote werden nach dem Versand nicht nachgefasst. Discovery-Termin grob vereinbart.', company: 'nordwerk', contact: 'meyer', when: -6 },
    { type: 'email', title: 'Unterlagen an Nordwerk gesendet', body: null, company: 'nordwerk', contact: 'meyer', when: -5 },
    { type: 'meeting', title: 'Discovery Helios Klimatechnik', body: 'Projekte schlafen nach der Planungsphase ein. Kapazität im Innendienst ist der Engpass.', company: 'helios', contact: 'arslan', when: -3 },
    { type: 'note', title: 'Notiz zu Brandt & Söhne', body: 'Empfehlung von Jana Meyerhoff. Familienunternehmen, Geschäftsführer entscheidet selbst.', company: 'brandt', contact: null, when: -1 },
  ] as const
  for (const a of activities) {
    await tx`insert into public.activities (organization_id, type, title, body, occurred_at, company_id, contact_id, actor, is_demo, created_by)
      values (${org}, ${a.type}, ${a.title}, ${a.body}, ${at(a.when)}, ${ids[a.company]!}, ${a.contact ? cids[a.contact]! : null}, 'human', true, ${userId})`
  }

  const insights = [
    { company: 'nordwerk', kind: 'fact', statement: 'Angebote werden nach dem Versand nicht systematisch nachgefasst.', status: null, source: 'discovery' },
    { company: 'nordwerk', kind: 'hypothesis', statement: 'Mehr als 100 Angebote sind älter als 60 Tage und ungeklärt.', status: 'open', source: 'manual' },
    { company: 'helios', kind: 'customer_quote', statement: '„Wir haben schlicht keine Leute, die alten Projekten hinterhertelefonieren.“', status: null, source: 'discovery' },
    { company: 'helios', kind: 'hypothesis', statement: 'Budget für einen Pilot ist im laufenden Quartal vorhanden.', status: 'open', source: 'manual' },
  ] as const
  for (const i of insights) {
    await tx`insert into public.insights (organization_id, company_id, kind, statement, hypothesis_status, source, is_demo, created_by)
      values (${org}, ${ids[i.company]!}, ${i.kind}, ${i.statement}, ${i.status}, ${i.source}, true, ${userId})`
  }
  console.log(`Demo-Daten angelegt: ${companies.length} Unternehmen, ${contacts.length} Kontakte, ${tasks.length} Aufgaben, ${activities.length} Aktivitäten, ${insights.length} Erkenntnisse.`)
})
await sql.end()
