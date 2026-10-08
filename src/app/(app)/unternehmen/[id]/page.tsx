import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CalendarClock, History } from 'lucide-react'
import { requireSession } from '@/server/auth/session'
import { getCompany360, type Company360 } from '@/server/services/companies'
import { Skeleton, EmptyState } from '@/components/ui/states'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { CompanyHeader } from '@/features/companies/company-header'
import { FactsAndHypotheses } from '@/features/companies/insights-panel'
import { NewContactButton } from '@/features/contacts/contact-form'
import { NewTaskButton } from '@/features/tasks/task-form'
import { TaskList } from '@/features/tasks/task-list'
import { NewActivityButton } from '@/features/activities/activity-form'
import { Timeline } from '@/features/activities/timeline'
import { NewOpportunityButton } from '@/features/pipeline/opportunity-form'
import { StartDiscoveryButton } from '@/features/discovery/start-dialog'
import { DiscoveryList } from '@/features/discovery/discovery-list'
import { listDiscoveries } from '@/server/services/discovery'
import { de } from '@/i18n/de'
import { berlinDay, formatDate, formatMoney, formatNumber, relativeDay } from '@/lib/format'

export const metadata: Metadata = { title: 'Unternehmen' }

export default function CompanyPage({ params }: PageProps<'/unternehmen/[id]'>) {
  return (
    <Suspense fallback={<CompanySkeleton />}>
      {params.then(({ id }) => (
        <CompanyView id={id} />
      ))}
    </Suspense>
  )
}

function CompanySkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-20 w-2/3" />
      <Skeleton className="h-10" />
      <Skeleton className="h-64" />
    </div>
  )
}

async function CompanyView({ id }: { id: string }) {
  const session = await requireSession()
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [data, discoveries] = await Promise.all([getCompany360(session.ctx, id), listDiscoveries(session.ctx, { companyId: id })])
  if (!data) notFound()
  const { company } = data
  const today = berlinDay()
  const contactOptions = data.contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), companyId: c.companyId }))

  return (
    <>
      <nav className="mb-3 text-[13px] text-faint" aria-label="Pfad">
        <Link href="/unternehmen" className="hover:text-fg">
          {de.nav.companies}
        </Link>
      </nav>
      <CompanyHeader
        company={company}
        isDemo={company.isDemo}
        actions={
          <>
            <Link href={`/unternehmen/${company.id}/vorbereitung`} className={buttonVariants({ variant: 'secondary' })}>
              Vorbereiten
            </Link>
            <NewActivityButton label="Notiz" companyId={company.id} contacts={contactOptions} />
            <NewTaskButton label="Aufgabe" variant="secondary" initial={{ companyId: company.id }} contacts={contactOptions} />
          </>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList aria-label="Bereiche">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="contacts">Kontakte · {data.contacts.length}</TabsTrigger>
          <TabsTrigger value="activities">Aktivitäten</TabsTrigger>
          <TabsTrigger value="discovery">Discovery · {discoveries.length}</TabsTrigger>
          <TabsTrigger value="opportunities">Chancen · {data.opportunities.length}</TabsTrigger>
          <TabsTrigger value="tasks">Aufgaben · {data.openTasks.length}</TabsTrigger>
          <TabsTrigger value="documents">Dokumente</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 grid gap-4">
          <NextAndLast data={data} today={today} />
          <FactsAndHypotheses companyId={company.id} insights={data.insights.filter((i) => i.kind === 'fact' || i.kind === 'hypothesis')} />
          <MasterData company={company} />
        </TabsContent>

        <TabsContent value="contacts" className="mt-5">
          <div className="mb-3 flex justify-end">
            <NewContactButton variant="secondary" initial={{ companyId: company.id }} />
          </div>
          {data.contacts.length === 0 ? (
            <EmptyState title="Noch keine Kontakte" description="Wer ist dein Ansprechpartner bei diesem Unternehmen?" />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.contacts.map((c) => (
                <li key={c.id}>
                  <Link href={`/kontakte/${c.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-line-strong">
                    <p className="font-medium">{`${c.firstName} ${c.lastName}`.trim()}</p>
                    <p className="text-[13px] text-muted">{c.jobTitle ?? '–'}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge>{de.decisionRole[c.decisionRole]}</Badge>
                      <Badge tone="outline">{de.relationshipStatus[c.relationshipStatus]}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="activities" className="mt-5">
          <div className="mb-4 flex justify-end">
            <NewActivityButton companyId={company.id} contacts={contactOptions} />
          </div>
          {data.activities.length === 0 ? (
            <EmptyState title="Noch keine Aktivitäten" description="Dokumentiere Anrufe, Meetings und Notizen. Sie bilden den Verlauf dieses Unternehmens." />
          ) : (
            <Timeline entries={data.activities} />
          )}
        </TabsContent>

        <TabsContent value="discovery" className="mt-5">
          <div className="mb-3 flex flex-wrap justify-end gap-2">
            <StartDiscoveryButton mode="document" companyId={company.id} contacts={contactOptions} />
            <StartDiscoveryButton mode="live" companyId={company.id} contacts={contactOptions} variant="secondary" />
          </div>
          {discoveries.length === 0 ? (
            <EmptyState title="Noch keine Discovery-Gespräche" description="Starte ein Gespräch oder dokumentiere ein bereits geführtes Gespräch." />
          ) : (
            <DiscoveryList items={discoveries} showCompany={false} />
          )}
        </TabsContent>

        <TabsContent value="opportunities" className="mt-5">
          <div className="mb-3 flex justify-end">
            <NewOpportunityButton variant="secondary" initial={{ companyId: company.id }} contacts={contactOptions} />
          </div>
          {data.opportunities.length === 0 ? (
            <EmptyState title="Noch keine Chancen" description="Sobald ein Pilot oder Auftrag in Sicht ist, lege hier eine Chance an." />
          ) : (
            <ul className="grid gap-2">
              {data.opportunities.map(({ opportunity: o, stageName, outcome }) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{o.title}</p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {o.valueCents != null ? formatMoney(o.valueCents) : 'Wert offen'}
                      {o.nextStep && ` · Nächster Schritt: ${o.nextStep}`}
                      {o.nextStepDate && ` (${relativeDay(o.nextStepDate, today)})`}
                      {o.lostReason && ` · Grund: ${o.lostReason}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={outcome === 'won' ? 'success' : outcome === 'lost' ? 'danger' : 'accent'}>{stageName}</Badge>
                    <Link href="/pipeline" className="text-[13px] text-muted hover:text-accent">
                      In Pipeline
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-5">
          <div className="mb-2 flex justify-end">
            <NewTaskButton variant="secondary" initial={{ companyId: company.id }} contacts={contactOptions} />
          </div>
          {data.openTasks.length === 0 ? (
            <EmptyState title="Keine offenen Aufgaben" description="Was ist der nächste Schritt bei diesem Unternehmen?" />
          ) : (
            <Card className="px-4">
              <TaskList tasks={data.openTasks} today={today} showCompany={false} contacts={contactOptions} />
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-5">
          <EmptyState title="Dokumente" description="Ablage für Angebote, Notizen und Unterlagen zum Unternehmen." actions={<Badge>{de.common.comingSoon}</Badge>} />
        </TabsContent>
      </Tabs>
    </>
  )
}

function NextAndLast({ data, today }: { data: Company360; today: string }) {
  const next = data.openTasks[0]
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="p-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-faint">
          <CalendarClock className="size-4" aria-hidden /> Nächste Aktion
        </div>
        {next ? (
          <>
            <p className="mt-2 font-medium">{next.title}</p>
            <p className="text-[13px] text-muted">{next.dueDate ? relativeDay(next.dueDate, today) : 'ohne Termin'}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-warning">Kein nächster Schritt geplant.</p>
        )}
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-faint">
          <History className="size-4" aria-hidden /> Letzter Kontakt
        </div>
        {data.lastContactAt ? (
          <p className="mt-2 font-medium tabular">{formatDate(data.lastContactAt)}</p>
        ) : (
          <p className="mt-2 text-sm text-muted">Noch kein dokumentierter Kontakt.</p>
        )}
      </Card>
    </div>
  )
}

function MasterData({ company }: { company: Company360['company'] }) {
  const yesNo = (b: boolean | null) => (b == null ? null : b ? 'Ja' : 'Nein')
  const rows: [string, string | null][] = [
    ['Branche', company.industry],
    ['Standort', company.city],
    ['Mitarbeiter', company.employeeCount != null ? formatNumber(company.employeeCount) : null],
    ['Unternehmensgröße', company.sizeClass],
    ['Projektgeschäft', yesNo(company.hasProjectBusiness)],
    ['Angebotsgeschäft', yesNo(company.hasQuoteBusiness)],
    ['Geschäftsmodell', company.businessModel],
    ['Vertriebsstruktur', company.salesStructure],
    ['Recovery Use Case', company.recoveryUseCase],
    ['Quelle', company.source],
  ]
  return (
    <Card>
      <CardHeader title="Stammdaten" description="Leere Felder sind unbekannt, nicht geschätzt." />
      <CardBody>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[12px] text-faint">{label}</dt>
              <dd className={value ? 'whitespace-pre-line text-sm' : 'text-sm text-faint'}>{value ?? 'unbekannt'}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  )
}
