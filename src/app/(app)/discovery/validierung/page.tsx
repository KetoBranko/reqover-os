import { Suspense } from 'react'
import type { Metadata } from 'next'
import { BarChart3, Info } from 'lucide-react'
import { requireSession } from '@/server/auth/session'
import { getValidation } from '@/server/services/overview'
import { NO_DATA, SMALL_SAMPLE, type CountRow, type ValidationStats } from '@/domain/briefing'
import { PageHeader } from '@/components/page-header'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button'
import { DiscoveryTabs } from '@/features/discovery/discovery-tabs'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Validierung' }

export default function ValidationPage() {
  return (
    <>
      <PageHeader title="Discovery" description="Validierungsfortschritt, berechnet aus abgeschlossenen Discovery-Gesprächen." />
      <DiscoveryTabs active="validation" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </>
  )
}

async function Content() {
  const session = await requireSession()
  const v = await getValidation(session.ctx)
  if (v.interviews === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Noch keine abgeschlossenen Gespräche"
        description={`${NO_DATA} Die Werte entstehen aus den Signalen und Angaben, die du beim Abschließen eines Discovery-Gesprächs festhältst.`}
        actions={
          <Link href="/discovery?neu=1" className={buttonVariants({ variant: 'primary' })}>
            Discovery starten
          </Link>
        }
      />
    )
  }
  return (
    <div className="grid gap-5">
      {v.interviews < SMALL_SAMPLE && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning" role="note">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Kleine Stichprobe: {v.interviews === 1 ? 'ein Gespräch' : `${v.interviews} Gespräche`}. Die Werte zeigen Tendenzen, sind aber noch nicht belastbar.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Signale" description={`${v.interviews} abgeschlossene Gespräche mit ${v.companies} Unternehmen`} />
          <CardBody>
            <SignalTable v={v} />
          </CardBody>
        </Card>
        <div className="grid content-start gap-5 lg:col-span-2">
          <TopList title="Häufigster Pain" rows={v.topPains} />
          <TopList title="Häufigster Recovery Use Case" rows={v.topUseCases} />
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <TopList title="Häufigste Einwände" rows={v.topObjections} />
        <TopList title="Gründe gegen externe Bearbeitung" rows={v.topConcerns} />
        <TopList title="Gewünschte Kennzahlen" rows={v.topKpis} />
      </div>
      <p className="text-[12px] text-faint">
        Grundlage: nur abgeschlossene Gespräche; Entwürfe zählen nicht. „Pilotangebot“ und „Gewonnen“ zählen Unternehmen mit Discovery, deren Chance die Phase „Angebot“ bzw. „Gewonnen“ erreicht hat.
      </p>
    </div>
  )
}

function SignalTable({ v }: { v: ValidationStats }) {
  const rows = [
    ...v.signals.map((s) => ({ key: s.key, label: s.label, value: s.yes, total: v.interviews, detail: `Nein ${s.no} · Unklar ${s.unclear}` })),
    { key: 'proposed', label: 'Pilotangebot', value: v.proposed, total: v.companies, detail: 'Unternehmen' },
    { key: 'won', label: 'Gewonnen', value: v.won, total: v.companies, detail: 'Unternehmen' },
  ]
  return (
    <dl className="grid gap-3.5">
      {rows.map((r) => {
        const pct = r.total ? Math.round((r.value / r.total) * 100) : 0
        return (
          <div key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="text-fg">{r.label}</dt>
              <dd className="tabular font-semibold text-fg">
                {r.value}/{r.total}
              </dd>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-[12px] text-faint">{r.detail}</p>
          </div>
        )
      })}
    </dl>
  )
}

function TopList({ title, rows }: { title: string; rows: CountRow[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        {rows.length ? (
          <ol className="grid gap-2 text-sm">
            {rows.map((r) => (
              <li key={r.label} className="flex items-start justify-between gap-3">
                <span className="text-fg">{r.label}</span>
                <span className="tabular shrink-0 text-muted">{r.count} ×</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-faint">{NO_DATA}</p>
        )}
      </CardBody>
    </Card>
  )
}
