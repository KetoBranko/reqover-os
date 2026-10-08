import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Users } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { SearchBox } from '@/components/list/search-box'
import { Pagination } from '@/components/list/pagination'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { NewContactButton } from '@/features/contacts/contact-form'
import { requireSession } from '@/server/auth/session'
import { listContacts } from '@/server/services/contacts'
import { companyOptions } from '@/server/services/companies'
import { de } from '@/i18n/de'
import { berlinDay, formatDate, relativeDay } from '@/lib/format'
import { pageNumber, str } from '@/lib/params'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Kontakte' }
const PAGE_SIZE = 50

export default function ContactsPage({ searchParams }: PageProps<'/kontakte'>) {
  return (
    <>
      <PageHeader
        title={de.nav.contacts}
        description="Ansprechpartner bei deinen Unternehmen."
        actions={
          <Suspense fallback={null}>
            {searchParams.then((p) => (
              <NewContactAction key={str(p.neu) ?? 'x'} autoOpen={Boolean(str(p.neu))} />
            ))}
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton className="mb-4 h-10 sm:w-80" />}>
        <SearchBox placeholder="Name, E-Mail oder Unternehmen" className="mb-4 sm:w-80" />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-64" />}>
        {searchParams.then((p) => (
          <ContactList q={str(p.q)} page={pageNumber(p.seite)} />
        ))}
      </Suspense>
    </>
  )
}

async function NewContactAction({ autoOpen }: { autoOpen: boolean }) {
  const session = await requireSession()
  const companies = await companyOptions(session.ctx)
  if (!companies.length) {
    return (
      <Link href="/unternehmen?neu=1" className={buttonVariants({ variant: 'primary' })}>
        Erst ein Unternehmen anlegen
      </Link>
    )
  }
  return <NewContactButton companies={companies} autoOpen={autoOpen} navigateOnCreate />
}

async function ContactList({ q, page }: { q?: string; page: number }) {
  const session = await requireSession()
  const { items, total } = await listContacts(session.ctx, { q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  const today = berlinDay()
  if (!items.length) {
    return q ? (
      <EmptyState icon={Users} title="Keine Treffer" description="Kein Kontakt passt zur Suche." />
    ) : (
      <EmptyState icon={Users} title="Noch keine Kontakte" description="Kontakte gehören immer zu einem Unternehmen. Lege sie direkt beim Unternehmen oder hier an." />
    )
  }
  return (
    <>
      <Card className="divide-y divide-line">
        {items.map(({ contact: c, companyName, lastContactAt, nextContactDate }) => (
          <Link key={c.id} href={`/kontakte/${c.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-2/50 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{`${c.firstName} ${c.lastName}`.trim()}</p>
              <p className="text-[13px] text-muted">{[c.jobTitle, companyName].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-faint">
              <Badge>{de.decisionRole[c.decisionRole]}</Badge>
              <span className="tabular">Letzter Kontakt: {lastContactAt ? formatDate(lastContactAt) : '–'}</span>
              {nextContactDate && <span>Nächster: {relativeDay(nextContactDate, today)}</span>}
            </div>
          </Link>
        ))}
      </Card>
      <Pagination basePath="/kontakte" params={{ q }} page={page} pageSize={PAGE_SIZE} total={total} />
    </>
  )
}
