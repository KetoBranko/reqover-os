import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Columns3 } from 'lucide-react'
import { requireSession } from '@/server/auth/session'
import { getBoard } from '@/server/services/opportunities'
import { companyOptions } from '@/server/services/companies'
import { contactOptions } from '@/server/services/contacts'
import { berlinDay, formatMoney } from '@/lib/format'
import { str } from '@/lib/params'
import { PageHeader } from '@/components/page-header'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { SearchBox } from '@/components/list/search-box'
import { Board } from '@/features/pipeline/board'
import { NewOpportunityButton } from '@/features/pipeline/opportunity-form'
import { de } from '@/i18n/de'

export const metadata: Metadata = { title: de.nav.pipeline }

export default function PipelinePage({ searchParams }: PageProps<'/pipeline'>) {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      {searchParams.then((p) => (
        <PipelineContent q={str(p.q)} neu={str(p.neu)} />
      ))}
    </Suspense>
  )
}

async function PipelineContent({ q, neu }: { q?: string; neu?: string }) {
  const session = await requireSession()
  const [board, companies, contacts] = await Promise.all([getBoard(session.ctx, { q }), companyOptions(session.ctx), contactOptions(session.ctx)])
  const today = berlinDay()
  const openStageIds = new Set(board.stages.filter((s) => s.outcome === 'open').map((s) => s.id))
  const open = board.cards.filter((c) => openStageIds.has(c.stageId))
  const openValue = open.reduce((s, c) => s + (c.valueCents ?? 0), 0)

  return (
    <>
      <PageHeader
        title={de.nav.pipeline}
        description={
          open.length
            ? `${open.length} offene ${open.length === 1 ? 'Chance' : 'Chancen'}${openValue ? ` · ${formatMoney(openValue)} erwarteter Wert` : ''}`
            : 'Verkaufschancen von „Kontakt aufnehmen“ bis „Gewonnen“.'
        }
        actions={
          companies.length ? (
            <NewOpportunityButton key={neu ?? 'x'} autoOpen={Boolean(neu)} companies={companies} contacts={contacts} />
          ) : null
        }
      />
      {board.cards.length > 0 && (
        <div className="mb-4 max-w-sm">
          <SearchBox placeholder="Chancen suchen" />
        </div>
      )}
      {!companies.length ? (
        <EmptyState
          icon={Columns3}
          title="Noch keine Unternehmen"
          description="Eine Chance gehört immer zu einem Unternehmen. Lege zuerst ein Unternehmen an."
        />
      ) : !board.cards.length ? (
        q ? (
          <EmptyState icon={Columns3} title="Keine Treffer" description="Keine Chance passt zur Suche." />
        ) : (
          <EmptyState
            icon={Columns3}
            title="Noch keine Chancen"
            description="Lege für ein Unternehmen eine Chance an, sobald ein Gespräch in Sicht ist. Danach ziehst du sie durch die Phasen."
            actions={<NewOpportunityButton label="Erste Chance anlegen" companies={companies} contacts={contacts} />}
          />
        )
      ) : (
        <Board stages={board.stages} cards={board.cards} today={today} contacts={contacts} />
      )}
    </>
  )
}

function BoardSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-10 w-64" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-72 w-64 shrink-0" />
        ))}
      </div>
    </div>
  )
}
