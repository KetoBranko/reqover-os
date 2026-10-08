import { Suspense } from 'react'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { requireSession } from '@/server/auth/session'
import { getOverview } from '@/server/services/overview'
import { requestNow } from '@/server/clock'
import { briefingLines, greeting } from '@/domain/briefing'
import { berlinHour, formatDateTime, formatLongDate } from '@/lib/format'
import { Skeleton, EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button'
import { BriefingCard } from '@/features/overview/briefing-card'
import { PriorityList } from '@/features/overview/priority-list'
import { KpiGrid } from '@/features/overview/kpi-grid'

export default function OverviewPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview />
    </Suspense>
  )
}

function OverviewSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Übersicht wird geladen">
      <Skeleton className="h-14 w-72" />
      <Skeleton className="h-44" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}

async function Overview() {
  const session = await requireSession()
  const now = await requestNow()
  const data = await getOverview(session.ctx, now)
  const lines = briefingLines({ items: data.items, counts: data.counts, validation: data.validation, changes: data.changes, formatSince: formatDateTime })
  const isEmpty = data.kpis.targetCompanies === 0 && data.kpis.pipelineCount === 0 && data.kpis.discoveriesCompleted === 0

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-sm text-muted">{formatLongDate(now)}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{greeting(berlinHour(now), session.firstName ?? null)}</h1>
      </header>

      <BriefingCard lines={lines} top={data.items[0] ?? null} />

      {isEmpty && (
        <EmptyState
          icon={Building2}
          title="Noch keine Zielunternehmen"
          description="Sobald du Unternehmen, Gespräche und Aufgaben erfasst, priorisiert ReQover hier deinen Tag."
          actions={
            <Link href="/unternehmen?neu=1" className={buttonVariants({ variant: 'primary' })}>
              Erstes Unternehmen anlegen
            </Link>
          }
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="today-title" className="lg:col-span-2">
          <h2 id="today-title" className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
            Heute wichtig
          </h2>
          <PriorityList items={data.items} />
        </section>
        <section aria-labelledby="kpi-title">
          <h2 id="kpi-title" className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted">
            Kennzahlen
          </h2>
          <KpiGrid kpis={data.kpis} />
        </section>
      </div>
    </div>
  )
}
