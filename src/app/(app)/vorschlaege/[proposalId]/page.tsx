import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { requireSession } from '@/server/auth/session'
import { getProposal } from '@/server/services/proposals'
import { Skeleton } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button'
import { ProposalReview } from '@/features/ai/review'
import { formatDateTime } from '@/lib/format'

export const metadata: Metadata = { title: 'Vorschlag prüfen' }

const UUID = /^[0-9a-f-]{36}$/i

const STATUS_TEXT = {
  applied: 'Dieser Vorschlag wurde vollständig übernommen.',
  partially_applied: 'Dieser Vorschlag wurde teilweise übernommen.',
  rejected: 'Dieser Vorschlag wurde verworfen.',
  failed: 'Bei diesem Vorschlag ist ein Fehler aufgetreten.',
} as const

export default function ProposalPage({ params }: PageProps<'/vorschlaege/[proposalId]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      {params.then(({ proposalId }) => (
        <Proposal proposalId={proposalId} />
      ))}
    </Suspense>
  )
}

/** Review of an assistant proposal; conversation analyses keep their own page next to the conversation. */
async function Proposal({ proposalId }: { proposalId: string }) {
  if (!UUID.test(proposalId)) notFound()
  const session = await requireSession()
  const data = await getProposal(session.ctx, proposalId)
  if (!data) notFound()
  const { proposal, actions } = data
  if (proposal.discoveryId) redirect(`/discovery/${proposal.discoveryId}/auswertung/${proposalId}`)
  const model = proposal.model === 'testmodus' ? 'Testmodus, kein echtes Modell' : proposal.model

  return (
    <>
      <nav className="mb-3 text-[13px] text-faint" aria-label="Pfad">
        <Link href="/assistent" className="hover:text-fg">
          Assistent
        </Link>
      </nav>
      <header className="mb-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Vorschlag</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ich würde folgende Änderungen durchführen.</h1>
        <p className="mt-1.5 text-sm text-muted">
          {actions.length} {actions.length === 1 ? 'Änderung' : 'Änderungen'} · vorgeschlagen durch ReQover AI ({model}) · {formatDateTime(proposal.createdAt)}
        </p>
      </header>
      {proposal.status !== 'pending' ? (
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-fg">{STATUS_TEXT[proposal.status]}</p>
          <Link href="/assistent" className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} mt-3`}>
            Zum Assistenten
          </Link>
        </div>
      ) : (
        <ProposalReview proposalId={proposalId} returnTo="/assistent" actions={actions} current={data.current ?? {}} />
      )}
    </>
  )
}
