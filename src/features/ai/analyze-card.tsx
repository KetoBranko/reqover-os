'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { useAction } from '@/components/forms/use-action'
import { flushAllAutosaves } from '@/components/forms/use-autosave'
import { analyzeDiscoveryAction } from './actions'

/**
 * "Gespräch analysieren" (spec 13/14). Without a configured provider it explains
 * why instead of showing a button that cannot work.
 */
export function AnalyzeCard({
  discoveryId,
  unavailableReason,
  pendingProposalId,
}: {
  discoveryId: string
  unavailableReason: string | null
  pendingProposalId: string | null
}) {
  const router = useRouter()
  const analyze = useAction(analyzeDiscoveryAction)

  async function onAnalyze() {
    await flushAllAutosaves()
    const r = await analyze.run({ id: discoveryId })
    if (r.ok) router.push(`/discovery/${discoveryId}/auswertung/${r.data.proposalId}`)
  }

  return (
    <section aria-labelledby="ai-title" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="ai-title" className="text-sm font-semibold text-fg">
            Gespräch analysieren
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {unavailableReason ??
              (analyze.pending
                ? 'Ich lese deine Notizen und bereite Vorschläge vor …'
                : 'Ich lese deine Notizen und schlage Antworten, Signale, Evidence Score, Aufgaben und den nächsten Schritt vor. Gespeichert wird erst, was du bestätigst.')}
          </p>
        </div>
      </div>
      {!unavailableReason && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {pendingProposalId && (
            <Link href={`/discovery/${discoveryId}/auswertung/${pendingProposalId}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Offenen Vorschlag prüfen
            </Link>
          )}
          <Button variant={pendingProposalId ? 'outline' : 'primary'} size="sm" onClick={onAnalyze} loading={analyze.pending}>
            {pendingProposalId ? 'Neu analysieren' : 'Gespräch analysieren'}
          </Button>
        </div>
      )}
    </section>
  )
}
