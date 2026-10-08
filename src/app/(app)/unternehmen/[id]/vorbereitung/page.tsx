import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Mail, Phone } from 'lucide-react'
import { requireSession } from '@/server/auth/session'
import { getCompany360 } from '@/server/services/companies'
import { getPreparation } from '@/server/services/overview'
import { NO_DATA, explain } from '@/domain/briefing'
import { CORE_QUESTION, EVIDENCE_MAX } from '@/domain/discovery'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/states'
import { StartDiscoveryButton } from '@/features/discovery/start-dialog'
import { Timeline } from '@/features/activities/timeline'
import { de } from '@/i18n/de'
import { berlinDay, formatDate, formatDay, formatMoney, relativeDay } from '@/lib/format'

export const metadata: Metadata = { title: 'Gesprächsvorbereitung' }

export default function PreparationPage({ params }: PageProps<'/unternehmen/[id]/vorbereitung'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      {params.then(({ id }) => (
        <Preparation id={id} />
      ))}
    </Suspense>
  )
}

async function Preparation({ id }: { id: string }) {
  const session = await requireSession()
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [data, prep] = await Promise.all([getCompany360(session.ctx, id), getPreparation(session.ctx, id)])
  if (!data) notFound()
  const { company } = data
  const today = berlinDay()
  const offer = session.organization.settings.pilotOffer
  const facts = data.insights.filter((i) => i.kind === 'fact')
  const hypotheses = data.insights.filter((i) => i.kind === 'hypothesis' && i.hypothesisStatus !== 'refuted')
  const quotes = data.insights.filter((i) => i.kind === 'customer_quote').slice(0, 3)
  const openOpps = data.opportunities.filter((o) => o.outcome === 'open')
  const d = prep.latestDiscovery
  const contactOptions = data.contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), companyId: c.companyId }))

  return (
    <>
      <nav className="mb-3 text-[13px] text-faint" aria-label="Pfad">
        <Link href="/unternehmen" className="hover:text-fg">
          {de.nav.companies}
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/unternehmen/${company.id}`} className="hover:text-fg">
          {company.name}
        </Link>
      </nav>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Gesprächsvorbereitung</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{company.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{de.companyStatus[company.status]}</Badge>
            {company.industry && <Badge tone="outline">{company.industry}</Badge>}
            {company.isDemo && <Badge tone="warning">Demo</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/unternehmen/${company.id}`} className={buttonVariants({ variant: 'secondary' })}>
            Unternehmen öffnen
          </Link>
          <StartDiscoveryButton mode="live" companyId={company.id} contacts={contactOptions} />
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid content-start gap-5 lg:col-span-2">
          <Card>
            <CardHeader title="Warum jetzt?" />
            <CardBody>
              {prep.priority ? (
                <>
                  <p className="text-[15px] text-fg">{explain(prep.priority)}</p>
                  {prep.priority.actions.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
                      {prep.priority.actions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">Für dieses Unternehmen ist aktuell nichts fällig.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Bisheriges Discovery" description={d?.completedAt ? `Abgeschlossen am ${formatDate(d.completedAt)}` : undefined} />
            <CardBody className="grid gap-4 text-sm">
              {d ? (
                <>
                  {d.summary && <Field label="Zusammenfassung">{d.summary}</Field>}
                  {d.mainPain && <Field label="Hauptschmerz">{d.mainPain}</Field>}
                  {d.coreQuestionAnswer && <Field label="Antwort auf die Kernfrage">{quoted(d.coreQuestionAnswer)}</Field>}
                  {d.objections.length > 0 && <Field label="Einwände">{d.objections.join(' · ')}</Field>}
                  {d.externalizationConcerns.length > 0 && <Field label="Bedenken gegen externe Bearbeitung">{d.externalizationConcerns.join(' · ')}</Field>}
                  <Field label="Evidence Score">{d.rated > 0 ? `${d.points}/${EVIDENCE_MAX} (${d.rated} von 10 Kategorien bewertet)` : 'Noch nicht bewertet'}</Field>
                  <Link href={`/discovery/${d.id}`} className="text-[13px] text-accent hover:underline">
                    Gespräch öffnen
                  </Link>
                </>
              ) : (
                <p className="text-muted">Noch kein abgeschlossenes Discovery-Gespräch.{prep.openDiscoveries ? ` ${prep.openDiscoveries} offen.` : ''}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Offene Kernfragen"
              description={d ? `${prep.openCoreQuestions.length} von ${prep.coreQuestionCount} im letzten Gespräch unbeantwortet` : 'Die wichtigsten Fragen für das Gespräch'}
            />
            <CardBody>
              {!d?.coreQuestionAnswer && <p className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-fg">{CORE_QUESTION}</p>}
              {prep.openCoreQuestions.length ? (
                <div className="grid gap-3">
                  {[...new Set(prep.openCoreQuestions.map((q) => q.section))].map((section) => (
                    <div key={section}>
                      <p className="text-[12px] font-medium uppercase tracking-wider text-faint">{de.discoverySection[section as keyof typeof de.discoverySection] ?? section}</p>
                      <ul className="mt-1 grid gap-1 text-sm text-fg">
                        {prep.openCoreQuestions
                          .filter((q) => q.section === section)
                          .map((q) => (
                            <li key={q.key}>{q.prompt}</li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Alle Kernfragen wurden beantwortet.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Fakten und Hypothesen" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <InsightColumn title="Fakten" items={facts.map((f) => f.statement)} />
              <InsightColumn title="Offene Hypothesen" items={hypotheses.map((h) => h.statement)} />
              {quotes.length > 0 && <InsightColumn title="Kundenaussagen" items={quotes.map((q) => quoted(q.statement))} />}
            </CardBody>
          </Card>
        </div>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title="Ansprechpartner" />
            <CardBody>
              {data.contacts.length ? (
                <ul className="grid gap-3 text-sm">
                  {data.contacts.map((c) => (
                    <li key={c.id}>
                      <Link href={`/kontakte/${c.id}`} className="font-medium text-fg hover:text-accent">
                        {`${c.firstName} ${c.lastName}`.trim()}
                      </Link>
                      <p className="text-[13px] text-muted">{[c.jobTitle, c.decisionRole !== 'unknown' ? de.decisionRole[c.decisionRole] : null].filter(Boolean).join(' · ') || 'Rolle unbekannt'}</p>
                      <div className="mt-1 flex flex-wrap gap-3 text-[13px]">
                        {c.phone && (
                          <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                            <Phone className="size-3.5" aria-hidden />
                            {c.phone}
                          </a>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                            <Mail className="size-3.5" aria-hidden />
                            E-Mail
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Noch keine Kontakte erfasst.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Chancen und Aufgaben" />
            <CardBody className="grid gap-3 text-sm">
              {openOpps.map((o) => (
                <div key={o.opportunity.id}>
                  <p className="font-medium text-fg">{o.opportunity.title}</p>
                  <p className="text-[13px] text-muted">
                    {o.stageName}
                    {o.opportunity.valueCents != null && ` · ${formatMoney(o.opportunity.valueCents)}`}
                  </p>
                  <p className="text-[13px] text-faint">
                    Nächster Schritt: {o.opportunity.nextStep ?? 'nicht festgelegt'}
                    {o.opportunity.nextStepDate && ` · ${relativeDay(o.opportunity.nextStepDate, today)}`}
                  </p>
                </div>
              ))}
              {data.openTasks.map((t) => (
                <div key={t.id}>
                  <p className="text-fg">{t.title}</p>
                  {t.dueDate && <p className={t.dueDate < today ? 'text-[13px] text-danger' : 'text-[13px] text-faint'}>fällig {relativeDay(t.dueDate, today)}</p>}
                </div>
              ))}
              {!openOpps.length && !data.openTasks.length && <p className="text-muted">Keine offenen Chancen oder Aufgaben.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pilotangebot (Hypothese)" />
            <CardBody className="text-sm text-muted">
              Bis zu {offer.maxCases} Vorgänge, {offer.durationWeeks} Wochen, {formatMoney(offer.priceMinCents)}–{formatMoney(offer.priceMaxCents)} netto.
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Letzte Aktivitäten" />
            <CardBody>
              {data.activities.length ? (
                <Timeline entries={data.activities.slice(0, 5).map((a) => ({ ...a, actor: a.actor }))} />
              ) : (
                <p className="text-sm text-muted">{NO_DATA}</p>
              )}
              {data.lastContactAt && <p className="mt-1 text-[12px] text-faint">Letzter Kontakt: {formatDay(berlinDay(data.lastContactAt))}</p>}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-1 whitespace-pre-line text-fg">{children}</p>
    </div>
  )
}

function InsightColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wider text-faint">{title}</p>
      {items.length ? (
        <ul className="mt-2 grid gap-1.5 text-sm text-fg">
          {items.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-faint">Noch nichts erfasst.</p>
      )}
    </div>
  )
}

/** Wraps a verbatim statement in German quotes unless it already carries quotes. */
function quoted(s: string) {
  return /^["„“»]/.test(s.trim()) ? s : `„${s}“`
}
