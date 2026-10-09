'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUp, Check, Sparkles } from 'lucide-react'
import type { ProposalAction } from '@/domain/ai'
import { Button, buttonVariants } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { useAction } from '@/components/forms/use-action'
import { applyProposalAction, rejectProposalAction } from '@/features/ai/actions'
import { describeAction } from '@/features/ai/describe'
import { DictateButton } from '@/features/voice/dictate'
import { askAction, newConversationAction } from './actions'
import { cn } from '@/lib/cn'

export interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  text: string
  sources: string[]
  proposal: { id: string; status: string; actions: ProposalAction[] } | null
}

const EXAMPLES = [
  'Was muss ich heute machen?',
  'Welche Firmen sollte ich priorisieren?',
  'Welche Unternehmen haben bestätigten Bedarf, aber keinen nächsten Schritt?',
  'Wie läuft unsere Validierung?',
  'Welche Einwände hören wir am häufigsten?',
]

export function AssistantChat({ conversationId, items, initialQuestion }: { conversationId: string | null; items: ChatItem[]; initialQuestion: string | null }) {
  const [text, setText] = useState('')
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const ask = useAction(askAction)
  const reset = useAction(newConversationAction)
  const asked = useRef(false)
  const router = useRouter()
  const end = useRef<HTMLDivElement>(null)

  async function send(question: string) {
    const q = question.trim()
    if (!q || ask.pending) return
    setPendingQuestion(q)
    setText('')
    const r = await ask.run({ conversationId, text: q })
    setPendingQuestion(null)
    if (!r.ok) setText(q)
  }

  // A question handed over from the command bar is asked once.
  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true
      router.replace('/assistent', { scroll: false })
      void send(initialQuestion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the handed-over question
  }, [initialQuestion])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [items.length, pendingQuestion])

  const empty = items.length === 0 && !pendingQuestion
  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Antworten beruhen nur auf deinen Daten. Änderungen schlage ich vor; du bestätigst sie.</p>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => reset.run({})} loading={reset.pending}>
            Neues Gespräch
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-4" aria-live="polite">
        {empty && (
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-sm text-fg">Frag mich zum Beispiel:</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <li key={e}>
                  <button type="button" onClick={() => send(e)} className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-left text-[13px] text-muted hover:border-line-strong hover:text-fg">
                    {e}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {items.map((m) => (m.role === 'user' ? <UserBubble key={m.id} text={m.text} /> : <AssistantBubble key={m.id} item={m} />))}
        {pendingQuestion && (
          <>
            <UserBubble text={pendingQuestion} />
            <div className="flex items-center gap-2 text-sm text-muted" role="status">
              <Sparkles className="size-4 animate-pulse text-accent" aria-hidden />
              Ich sehe in deinen Daten nach …
            </div>
          </>
        )}
        <div ref={end} className="scroll-mb-44 lg:scroll-mb-24" />
      </div>

      <form
        className="sticky bottom-[calc(env(safe-area-inset-bottom)+72px)] mt-4 flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-2 lg:bottom-4"
        onSubmit={(e) => {
          e.preventDefault()
          void send(text)
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(text)
            }
          }}
          rows={1}
          placeholder="Frag ProRendo …"
          aria-label="Frage an den Assistenten"
          className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0"
        />
        <DictateButton compact label="Frage diktieren" onText={(t) => setText((x) => (x.trim() ? `${x.trim()} ${t}` : t))} className="shrink-0" />
        <Button type="submit" variant="primary" size="icon" aria-label="Senden" disabled={!text.trim() || ask.pending}>
          <ArrowUp />
        </Button>
      </form>
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-sm text-fg">{text}</p>
    </div>
  )
}

function AssistantBubble({ item }: { item: ChatItem }) {
  return (
    <div className="max-w-[92%]">
      <div className="whitespace-pre-line rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-fg">{item.text}</div>
      {item.sources.length > 0 && <p className="mt-1 px-1 text-[12px] text-faint">Datenbasis: {item.sources.join(', ')}</p>}
      {item.proposal && <ProposalCard proposal={item.proposal} />}
    </div>
  )
}

const DECIDED: Record<string, string> = {
  applied: 'Übernommen',
  partially_applied: 'Teilweise übernommen',
  rejected: 'Verworfen',
  failed: 'Fehlgeschlagen',
}

function ProposalCard({ proposal }: { proposal: NonNullable<ChatItem['proposal']> }) {
  const apply = useAction(applyProposalAction, { success: 'Änderungen übernommen.' })
  const reject = useAction(rejectProposalAction, { success: 'Vorschlag verworfen.' })
  const pending = proposal.status === 'pending'
  return (
    <section className={cn('mt-2 rounded-xl border bg-surface p-4', pending ? 'border-accent/40' : 'border-line')} aria-label="Vorgeschlagene Änderungen">
      <p className="text-[13px] font-medium text-fg">{pending ? 'Ich würde folgende Änderungen durchführen:' : `Vorschlag · ${DECIDED[proposal.status] ?? proposal.status}`}</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {proposal.actions.map((a) => {
          const d = describeAction(a)
          return (
            <li key={a.id} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              <span>
                <span className="text-muted">{d.label}: </span>
                <span className="text-fg">{d.text}</span>
              </span>
            </li>
          )
        })}
      </ul>
      {pending && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => apply.run({ proposalId: proposal.id, accepted: proposal.actions })} loading={apply.pending} disabled={reject.pending}>
            Übernehmen
          </Button>
          <Link href={`/vorschlaege/${proposal.id}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Bearbeiten
          </Link>
          <Button variant="ghost" size="sm" onClick={() => reject.run({ id: proposal.id })} loading={reject.pending} disabled={apply.pending}>
            Verwerfen
          </Button>
        </div>
      )}
      {apply.error && <p className="mt-2 text-[13px] text-danger">{apply.error.message}</p>}
    </section>
  )
}
