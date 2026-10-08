import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Building2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { SearchBox, FilterChips } from '@/components/list/search-box'
import { Pagination } from '@/components/list/pagination'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { Card } from '@/components/ui/card'
import { CompanyStatusBadge, DemoBadge, FitBadge } from '@/components/status'
import { NewCompanyButton } from '@/features/companies/company-form'
import { requireSession } from '@/server/auth/session'
import { listCompanies } from '@/server/services/companies'
import { COMPANY_STATUSES } from '@/domain/schemas'
import { de } from '@/i18n/de'
import { berlinDay, formatDate, relativeDay } from '@/lib/format'
import { oneOf, pageNumber, str } from '@/lib/params'

export const metadata: Metadata = { title: 'Unternehmen' }

const PAGE_SIZE = 50

export default function CompaniesPage({ searchParams }: PageProps<'/unternehmen'>) {
  return (
    <>
      <PageHeader
        title={de.nav.companies}
        description="Zielunternehmen, Gesprächspartner und ihr Stand."
        actions={
          <Suspense fallback={<NewCompanyButton />}>
            {searchParams.then((p) => (
              <NewCompanyButton key={str(p.neu) ?? 'x'} autoOpen={Boolean(str(p.neu))} />
            ))}
          </Suspense>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Suspense fallback={<Skeleton className="h-10 sm:w-80" />}>
          <SearchBox placeholder="Unternehmen suchen" className="sm:w-80" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterChips param="status" options={COMPANY_STATUSES.map((s) => ({ value: s, label: de.companyStatus[s] }))} />
        </Suspense>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        {searchParams.then((p) => (
          <CompanyList q={str(p.q)} status={oneOf(p.status, COMPANY_STATUSES)} page={pageNumber(p.seite)} />
        ))}
      </Suspense>
    </>
  )
}

function ListSkeleton() {
  return (
    <div className="grid gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  )
}

async function CompanyList({ q, status, page }: { q?: string; status?: (typeof COMPANY_STATUSES)[number]; page: number }) {
  const session = await requireSession()
  const { items, total } = await listCompanies(session.ctx, { q, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  const today = berlinDay()

  if (!items.length) {
    return q || status ? (
      <EmptyState icon={Building2} title="Keine Treffer" description="Kein Unternehmen passt zu Suche oder Filter." />
    ) : (
      <EmptyState
        icon={Building2}
        title="Noch keine Unternehmen"
        description="Lege dein erstes Zielunternehmen an. Kontakte, Gespräche und Chancen hängen daran."
        actions={<NewCompanyButton label="Erstes Unternehmen anlegen" />}
      />
    )
  }

  return (
    <>
      <Card className="hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-[12px] uppercase tracking-wider text-faint">
            <tr>
              <th className="px-4 py-3 font-medium">Unternehmen</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Pipeline</th>
              <th className="px-4 py-3 font-medium">Letzter Kontakt</th>
              <th className="px-4 py-3 font-medium">Nächste Aktion</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                <td className="px-4 py-3">
                  <Link href={`/unternehmen/${c.id}`} className="font-medium text-fg hover:text-accent">
                    {c.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-[13px] text-faint">
                    {[c.industry, c.city].filter(Boolean).join(' · ') || '–'}
                    {c.isDemo && <DemoBadge />}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <CompanyStatusBadge status={c.status} />
                    <FitBadge score={c.fitScore} />
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{c.stageKey ? (de.pipelineStage[c.stageKey as keyof typeof de.pipelineStage] ?? c.stageKey) : '–'}</td>
                <td className="px-4 py-3 text-muted tabular">{c.lastContactAt ? formatDate(c.lastContactAt) : '–'}</td>
                <td className="px-4 py-3 text-muted">
                  {c.nextTaskTitle ? (
                    <>
                      <span className="text-fg">{c.nextTaskTitle}</span>
                      {c.nextTaskDue && <span className="ml-1.5 text-faint">· {relativeDay(c.nextTaskDue, today)}</span>}
                    </>
                  ) : (
                    '–'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ul className="grid gap-2 md:hidden">
        {items.map((c) => (
          <li key={c.id}>
            <Link href={`/unternehmen/${c.id}`} className="block rounded-xl border border-line bg-surface p-4 active:bg-surface-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <CompanyStatusBadge status={c.status} />
              </div>
              <p className="mt-1 text-[13px] text-faint">{[c.industry, c.city].filter(Boolean).join(' · ') || '–'}</p>
              {c.nextTaskTitle && (
                <p className="mt-2 text-[13px] text-muted">
                  Nächste Aktion: {c.nextTaskTitle}
                  {c.nextTaskDue && ` · ${relativeDay(c.nextTaskDue, today)}`}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <Pagination basePath="/unternehmen" params={{ q, status }} page={page} pageSize={PAGE_SIZE} total={total} />
    </>
  )
}
