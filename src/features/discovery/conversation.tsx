'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAction } from '@/components/forms/use-action'
import { CORE_QUESTION } from '@/domain/discovery'
import { de } from '@/i18n/de'
import { endConversationAction } from './actions'
import { NoteField, QuestionField, type AnswerRow, type QuestionRow } from './fields'
import { ElapsedTimer } from './timer'

/**
 * Reduced conversation mode: company, contact, timer, the core questions and
 * one big notes area. Nothing is recorded; dictation is for own notes (Phase 8).
 */
export function ConversationMode({
  discoveryId,
  companyId,
  companyName,
  contactName,
  startedAt,
  questions,
  answers,
  rawNotes,
  coreAnswer,
}: {
  discoveryId: string
  companyId: string
  companyName: string
  contactName: string | null
  startedAt: string
  questions: QuestionRow[]
  answers: Record<string, AnswerRow>
  rawNotes: string | null
  coreAnswer: string | null
}) {
  const router = useRouter()
  const end = useAction(endConversationAction, { success: 'Gespräch beendet. Jetzt auswerten.' })
  const [showQuestions, setShowQuestions] = useState(true)
  const core = questions.filter((q) => q.isCore)

  async function finish() {
    const r = await end.run({ id: discoveryId })
    if (r.ok) router.push(`/discovery/${discoveryId}`)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-28 pt-4 lg:px-8">
      <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <span className="relative flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-40" />
          <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/unternehmen/${companyId}`} className="block truncate font-semibold hover:text-accent">
            {companyName}
          </Link>
          <p className="truncate text-[13px] text-muted">{contactName ?? 'Ohne Gesprächspartner'} · Discovery</p>
        </div>
        <ElapsedTimer startedAt={startedAt} />
        <Button variant="primary" onClick={finish} loading={end.pending}>
          <Square className="fill-current" aria-hidden />
          <span className="hidden sm:inline">Gespräch beenden</span>
          <span className="sm:hidden">Beenden</span>
        </Button>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_380px]">
        <section className="grid content-start gap-5">
          <div className="rounded-xl border border-accent/30 bg-accent-soft/30 p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-accent">{de.discoverySection.core_question}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed">{CORE_QUESTION}</p>
            <div className="mt-3">
              <NoteField discoveryId={discoveryId} field="coreQuestionAnswer" label="Antwort möglichst wörtlich" initial={coreAnswer} rows={3} />
            </div>
          </div>
          <NoteField
            discoveryId={discoveryId}
            field="rawNotes"
            label="Notizen"
            initial={rawNotes}
            rows={14}
            big
            placeholder="Stichpunkte während des Gesprächs. Wird automatisch gespeichert."
          />
          <p className="flex items-center gap-2 text-[12px] text-faint">
            Diktieren eigener Notizen <Badge>{de.common.comingSoon}</Badge>
            <span>· Das Gespräch selbst wird nicht aufgezeichnet.</span>
          </p>
        </section>

        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
          <button
            type="button"
            onClick={() => setShowQuestions((s) => !s)}
            aria-expanded={showQuestions}
            className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-[12px] font-semibold uppercase tracking-wider text-muted"
          >
            Kernfragen · {core.length}
            <ChevronDown className={showQuestions ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'} aria-hidden />
          </button>
          {showQuestions && (
            <div className="divide-y divide-line rounded-xl border border-line bg-surface px-4">
              {core.map((q) => (
                <QuestionField key={q.key} discoveryId={discoveryId} question={q} answer={answers[q.key]} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
