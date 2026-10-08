import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Activity } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { FilterChips, SearchBox } from '@/components/list/search-box'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { Card, CardBody } from '@/components/ui/card'
import { Timeline } from '@/features/activities/timeline'
import { requireSession } from '@/server/auth/session'
import { listTimeline } from '@/server/services/activities'
import { de } from '@/i18n/de'
import { str } from '@/lib/params'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Aktivitäten' }

const TYPE_FILTERS = ['call', 'meeting', 'email', 'note', 'discovery', 'stage_change', 'task', 'ai_action'] as const

export default function ActivitiesPage({ searchParams }: PageProps<'/aktivitaeten'>) {
  return (
    <>
      <PageHeader title={de.nav.activities} description="Alles, was passiert ist, in zeitlicher Reihenfolge." />
      <div className="mb-4 flex flex-col gap-3">
        <Suspense fallback={<Skeleton className="h-10 sm:w-80" />}>
          <SearchBox placeholder="In Aktivitäten suchen" className="sm:w-80" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips param="typ" options={TYPE_FILTERS.map((t) => ({ value: t, label: de.activityType[t] }))} />
        </Suspense>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        {searchParams.then((p) => (
          <ActivityList q={str(p.q)} type={TYPE_FILTERS.find((t) => t === str(p.typ))} before={str(p.vor)} />
        ))}
      </Suspense>
    </>
  )
}

async function ActivityList({ q, type, before }: { q?: string; type?: (typeof TYPE_FILTERS)[number]; before?: string }) {
  const session = await requireSession()
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined
  const { items, hasMore } = await listTimeline(session.ctx, { q, types: type ? [type] : undefined, before: beforeDate, limit: 50 })
  if (!items.length) {
    return q || type || before ? (
      <EmptyState icon={Activity} title="Keine Treffer" description="Keine Aktivität passt zu Suche oder Filter." />
    ) : (
      <EmptyState icon={Activity} title="Noch keine Aktivitäten" description="Sobald du Gespräche, Anrufe oder Notizen dokumentierst, entsteht hier der Verlauf." />
    )
  }
  const last = items[items.length - 1]!
  const nextParams = new URLSearchParams(Object.entries({ q, typ: type, vor: last.activity.occurredAt.toISOString() }).filter((e): e is [string, string] => Boolean(e[1])))
  return (
    <Card>
      <CardBody className="pt-5">
        <Timeline
          showContext
          entries={items.map(({ activity, companyName, contactName }) => ({ ...activity, companyName, contactName }))}
        />
        {hasMore && (
          <Link href={`/aktivitaeten?${nextParams.toString()}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Ältere anzeigen
          </Link>
        )}
      </CardBody>
    </Card>
  )
}
