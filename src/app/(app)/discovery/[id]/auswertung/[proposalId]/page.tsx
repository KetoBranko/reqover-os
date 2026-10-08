import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Info } from 'lucide-react'
import { requireSession } from '@/server/auth/session'
import { getProposal } from '@/server/services/proposals'
import { getDiscovery } from '@/server/services/discovery'
import { Skeleton } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button'
import { ProposalReview } from '@/features/ai/review'
import { formatDateTime } from '@/lib/format'

export const metadata: Metadata = { title: 'Gesprächsauswertung' }

const UUID = /^[0-9a-f-]{36}$/i

export default function ReviewPage({ params }: PageProps<'/discovery/[id]/auswertung/[proposalId]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      {params.then(({ id, proposalId }) => (
        <Review id={id} proposalId={proposalId} />
      ))}
    </Suspense>
  )
}

const STATUS_TEXT = {
  applied: 'Dieser Vorschlag wurde vollständig übernommen.',
  partially_applied: 'Dieser Vorschlag wurde teilweise übernommen.',
  rejected: 'Dieser Vorschlag wurde verworfen.',
  failed: 'Bei diesem Vorschlag ist ein Fehler aufgetreten.',
} as const

async function Review({ id, proposalId }: { id: string; proposalId: string }) {
  if (!UUID.test(id) || !UUID.test(proposalId)) notFound()
  const session = await requireSession()
  const [data, d] = await Promise.all([getProposal(session.ctx, proposalId), getDiscovery(session.ctx, id)])
  if (!data || !d || data.proposal.discoveryId !== id) notFound()
  const { proposal, actions, meta } = data
  const uncertain = actions.filter((a) => a.certainty === 'unsicher').length
  const model = proposal.model === 'testmodus' ? 'Testmodus, kein echtes Modell' : proposal.model

  return (
    <>
      <nav className="mb-3 text-[13px] text-faint" aria-label="Pfad">
        <Link href="/discovery" className="hover:text-fg">
          Discovery
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/discovery/${id}`} className="hover:text-fg">
          {d.companyName}
        </Link>
      </nav>
      <header className="mb-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Gesprächsauswertung</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ich habe folgende Informationen erkannt.</h1>
        <p className="mt-1.5 text-sm text-muted">
          {actions.length} Vorschläge{uncertain ? `, davon ${uncertain} unsicher` : ''} · vorgeschlagen durch ReQover AI ({model}) · {formatDateTime(proposal.createdAt)}
        </p>
      </header>

      {proposal.status !== 'pending' ? (
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-fg">{STATUS_TEXT[proposal.status]}</p>
          <Link href={`/discovery/${id}`} className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} mt-3`}>
            Zum Gespräch
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-muted" role="note">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            Noch ist nichts gespeichert. Prüfe die Angaben; unsichere sind markiert, Zitate stammen aus deinen Notizen.
          </p>
          {d.interview.status === 'completed' && (
            <p className="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning" role="alert">
              Das Gespräch ist abgeschlossen. Zum Übernehmen im Gespräch zuerst „Bearbeiten“ wählen.
            </p>
          )}
          {meta.dropped.length > 0 && (
            <details className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-muted">
              <summary className="cursor-pointer">{meta.dropped.length === 1 ? 'Ein Punkt wurde nicht übernommen' : `${meta.dropped.length} Punkte wurden nicht übernommen`}</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {meta.dropped.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </details>
          )}
          {actions.length === 0 && <p className="mb-4 text-sm text-muted">In den Notizen war nichts, das ich sicher zuordnen konnte.</p>}
          <ProposalReview proposalId={proposalId} returnTo={`/discovery/${id}`} actions={actions} current={data.current ?? {}} />
        </>
      )}
    </>
  )
}
