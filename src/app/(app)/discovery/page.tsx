import { Suspense } from 'react'
import type { Metadata } from 'next'
import { MessagesSquare } from 'lucide-react'
import { requireSession } from '@/server/auth/session'
import { listDiscoveries } from '@/server/services/discovery'
import { companyOptions } from '@/server/services/companies'
import { contactOptions } from '@/server/services/contacts'
import { str } from '@/lib/params'
import { PageHeader } from '@/components/page-header'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { StartDiscoveryButton } from '@/features/discovery/start-dialog'
import { DiscoveryList } from '@/features/discovery/discovery-list'
import { DiscoveryTabs } from '@/features/discovery/discovery-tabs'
import { de } from '@/i18n/de'

export const metadata: Metadata = { title: de.nav.discovery }

export default function DiscoveryIndex({ searchParams }: PageProps<'/discovery'>) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      {searchParams.then((p) => (
        <Content neu={str(p.neu)} />
      ))}
    </Suspense>
  )
}

async function Content({ neu }: { neu?: string }) {
  const session = await requireSession()
  const [items, companies, contacts] = await Promise.all([listDiscoveries(session.ctx), companyOptions(session.ctx), contactOptions(session.ctx)])
  const completed = items.filter((i) => i.interview.status === 'completed').length
  const actions = companies.length ? (
    <>
      <StartDiscoveryButton key={`d-${neu ?? 'x'}`} mode="document" companies={companies} contacts={contacts} />
      <StartDiscoveryButton key={`l-${neu ?? 'x'}`} mode="live" companies={companies} contacts={contacts} autoOpen={Boolean(neu)} />
    </>
  ) : null

  return (
    <>
      <PageHeader
        title={de.nav.discovery}
        description={items.length ? `${items.length} Gespräche · ${completed} abgeschlossen` : 'Strukturierte Gespräche, um den Bedarf zu validieren.'}
        actions={items.length ? actions : null}
      />
      <DiscoveryTabs active="list" />
      {!companies.length ? (
        <EmptyState icon={MessagesSquare} title="Noch keine Unternehmen" description="Ein Discovery-Gespräch gehört zu einem Unternehmen. Lege zuerst ein Unternehmen an." />
      ) : !items.length ? (
        <EmptyState
          icon={MessagesSquare}
          title="Noch keine Discovery-Gespräche"
          description="Starte dein erstes Gespräch oder dokumentiere ein bereits geführtes Gespräch."
          actions={actions}
        />
      ) : (
        <DiscoveryList items={items} />
      )}
    </>
  )
}
