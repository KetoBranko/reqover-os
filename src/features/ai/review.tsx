'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Quote } from 'lucide-react'
import { coerceAnswer, type ProposalAction } from '@/domain/ai'
import { parseMoneyToCents } from '@/lib/format'
import { de } from '@/i18n/de'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select, Textarea } from '@/components/ui/input'
import { useAction } from '@/components/forms/use-action'
import { applyProposalAction, rejectProposalAction } from './actions'
import { GROUPS, describeAction, formatAnswer } from './describe'
import { cn } from '@/lib/cn'

interface Row {
  accepted: boolean
  action: ProposalAction
  /** Set when an edit does not fit (e.g. an answer that does not match the question type). */
  invalid?: string
}

/**
 * Review screen (spec 14/20): nothing is saved until the person confirms.
 * Default view lists everything; "Bearbeiten" lets them deselect and change items.
 */
export function ProposalReview({
  proposalId,
  returnTo,
  actions,
  current,
}: {
  proposalId: string
  /** Where to go after a decision. */
  returnTo: string
  actions: ProposalAction[]
  current: Partial<Record<string, string | null>>
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(actions.map((a) => [a.id, { accepted: true, action: a }])))
  const [editing, setEditing] = useState(false)
  const apply = useAction(applyProposalAction)
  const reject = useAction(rejectProposalAction, { success: 'Vorschlag verworfen.' })

  const selected = Object.values(rows).filter((r) => r.accepted)
  const invalid = selected.some((r) => r.invalid)
  const update = (id: string, patch: Partial<Row>) => setRows((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }))

  async function submit(all: boolean) {
    const accepted = (all ? Object.values(rows) : selected).map((r) => r.action)
    const r = await apply.run({ proposalId, accepted })
    if (r.ok) {
      const { accepted: n, total } = r.data
      router.push(returnTo)
      const { toast } = await import('sonner')
      toast.success(n === total ? `Alle ${n} Änderungen übernommen.` : `${n} von ${total} Änderungen übernommen.`)
    }
  }

  async function discard() {
    const r = await reject.run({ id: proposalId })
    if (r.ok) router.push(returnTo)
  }

  const busy = apply.pending || reject.pending
  return (
    <div className="pb-28">
      <div className="grid gap-5">
        {GROUPS.map((g) => {
          const items = actions.filter((a) => describeAction(a).group === g.key)
          if (!items.length) return null
          return (
            <section key={g.key} aria-labelledby={`g-${g.key}`} className="rounded-xl border border-line bg-surface">
              <h2 id={`g-${g.key}`} className="px-4 pt-3.5 pb-2 text-[13px] font-semibold uppercase tracking-wider text-muted">
                {g.title}
              </h2>
              <ul className="divide-y divide-line">
                {items.map((a) => (
                  <ActionRow key={a.id} row={rows[a.id]!} editing={editing} current={a.type === 'discovery.field' ? (current[a.field] ?? null) : null} onChange={(patch) => update(a.id, patch)} />
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-20 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-[240px]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2">
          {apply.error && !apply.error.fieldErrors && <p className="mr-auto text-[13px] text-danger">{apply.error.message}</p>}
          <Button variant="ghost" onClick={discard} disabled={busy} loading={reject.pending}>
            Verwerfen
          </Button>
          {editing ? (
            <Button variant="primary" onClick={() => submit(false)} disabled={busy || invalid || selected.length === 0} loading={apply.pending}>
              Auswahl übernehmen ({selected.length})
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)} disabled={busy}>
                Bearbeiten
              </Button>
              <Button variant="primary" onClick={() => submit(true)} disabled={busy} loading={apply.pending}>
                Alles übernehmen
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionRow({ row, editing, current, onChange }: { row: Row; editing: boolean; current: string | null; onChange: (patch: Partial<Row>) => void }) {
  const a = row.action
  const d = describeAction(a)
  const set = (patch: Partial<ProposalAction>, invalid?: string) => onChange({ action: { ...a, ...patch } as ProposalAction, invalid })
  return (
    <li className={cn('flex gap-3 px-4 py-3', !row.accepted && 'opacity-55')}>
      {editing && (
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
          checked={row.accepted}
          onChange={(e) => onChange({ accepted: e.target.checked })}
          aria-label={`Übernehmen: ${d.label}`}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-muted">{d.label}</span>
          {a.certainty === 'unsicher' && <Badge tone="warning">Unsichere Angabe</Badge>}
        </div>
        {editing && row.accepted ? <Editor action={a} set={set} /> : <p className="mt-1 whitespace-pre-line text-sm text-fg">{d.text}</p>}
        {row.invalid && <p className="mt-1 text-[12px] text-danger">{row.invalid}</p>}
        {a.type === 'opportunity.stage' && a.to === 'won' && !a.orderConfirmedAt && !a.wonWithoutOrder && (
          <p className="mt-1 flex items-center gap-1 text-[12px] text-warning">
            <AlertTriangle className="size-3.5" aria-hidden />
            Eine bestätigte Beauftragung ist nicht hinterlegt. Unter „Bearbeiten“ ein Auftragsdatum angeben oder trotzdem als gewonnen markieren.
          </p>
        )}
        {current && a.type === 'discovery.field' && <p className="mt-1 text-[12px] text-faint">Ersetzt: {current.length > 140 ? `${current.slice(0, 140)} …` : current}</p>}
        {a.quote && (
          <p className="mt-1.5 flex gap-1.5 text-[13px] italic text-muted">
            <Quote className="mt-0.5 size-3.5 shrink-0 text-faint" aria-hidden />
            <span>„{a.quote}“</span>
          </p>
        )}
        {a.quoteVerified === false && (
          <p className="mt-1 flex items-center gap-1 text-[12px] text-warning">
            <AlertTriangle className="size-3.5" aria-hidden />
            Zitat nicht wörtlich in deinen Notizen gefunden
          </p>
        )}
      </div>
    </li>
  )
}

function Editor({ action: a, set }: { action: ProposalAction; set: (patch: Partial<ProposalAction>, invalid?: string) => void }) {
  const label = describeAction(a).label
  switch (a.type) {
    case 'discovery.field':
    case 'discovery.list_add':
      return <Textarea className="mt-1.5" rows={a.type === 'discovery.field' ? 3 : 1} value={a.value} aria-label={label} onChange={(e) => set({ value: e.target.value }, e.target.value.trim() ? undefined : 'Darf nicht leer sein.')} />
    case 'activity.note':
      return <Textarea className="mt-1.5" rows={3} value={a.body} aria-label={label} onChange={(e) => set({ body: e.target.value }, e.target.value.trim() ? undefined : 'Darf nicht leer sein.')} />
    case 'opportunity.stage':
      if (a.to === 'lost') {
        return <Input className="mt-1.5" value={a.lostReason ?? ''} placeholder="Grund" aria-label="Grund für Verloren" onChange={(e) => set({ lostReason: e.target.value || null }, e.target.value.trim() ? undefined : 'Für „Verloren“ wird ein Grund benötigt.')} />
      }
      if (a.to === 'won') {
        return (
          <div className="mt-1.5 grid gap-2 text-sm">
            <label className="flex flex-wrap items-center gap-2">
              Auftrag bestätigt am
              <Input type="date" className="w-44" value={a.orderConfirmedAt ?? ''} aria-label="Datum der Auftragsbestätigung" onChange={(e) => set({ orderConfirmedAt: e.target.value || null, wonWithoutOrder: e.target.value ? false : a.wonWithoutOrder })} />
            </label>
            {!a.orderConfirmedAt && (
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={a.wonWithoutOrder} onChange={(e) => set({ wonWithoutOrder: e.target.checked })} />
                Trotzdem als gewonnen markieren
              </label>
            )}
          </div>
        )
      }
      return <p className="mt-1 text-sm text-fg">{describeAction(a).text}</p>
    case 'insight.create':
      return <Textarea className="mt-1.5" rows={2} value={a.statement} aria-label={label} onChange={(e) => set({ statement: e.target.value }, e.target.value.trim() ? undefined : 'Darf nicht leer sein.')} />
    case 'discovery.signal':
      return (
        <Select className="mt-1.5 w-40" value={a.value} aria-label={label} onChange={(e) => set({ value: e.target.value as typeof a.value })}>
          {(['yes', 'no', 'unclear'] as const).map((v) => (
            <option key={v} value={v}>
              {de.signal[v]}
            </option>
          ))}
        </Select>
      )
    case 'evidence.score':
      return (
        <div className="mt-1.5 grid gap-2">
          <Select className="w-32" value={a.points} aria-label={`${label}: Punkte`} onChange={(e) => set({ points: Number(e.target.value) })}>
            {[0, 1, 2].map((p) => (
              <option key={p} value={p}>
                {p}/2
              </option>
            ))}
          </Select>
          <Textarea rows={2} value={a.rationale} aria-label={`${label}: Begründung`} onChange={(e) => set({ rationale: e.target.value }, e.target.value.trim() ? undefined : 'Bitte eine Begründung angeben.')} />
        </div>
      )
    case 'discovery.answer':
      return <AnswerEditor action={a} set={set} />
    case 'task.create':
      return (
        <div className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_11rem]">
          <Input value={a.title} aria-label="Aufgabe: Titel" onChange={(e) => set({ title: e.target.value }, e.target.value.trim() ? undefined : 'Bitte einen Titel angeben.')} />
          <Input type="date" value={a.dueDate ?? ''} aria-label="Aufgabe: Fälligkeit" onChange={(e) => set({ dueDate: e.target.value || null })} />
        </div>
      )
    case 'opportunity.create':
      return (
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          <Input value={a.title} aria-label="Chance: Titel" onChange={(e) => set({ title: e.target.value }, e.target.value.trim() ? undefined : 'Bitte einen Titel angeben.')} />
          <Input
            inputMode="decimal"
            defaultValue={a.valueCents != null ? (a.valueCents / 100).toLocaleString('de-DE') : ''}
            placeholder="Wert in €"
            aria-label="Chance: Wert in Euro"
            onChange={(e) => {
              const cents = parseMoneyToCents(e.target.value)
              set({ valueCents: cents }, e.target.value.trim() && cents == null ? 'Bitte einen Betrag wie 2.500 eingeben.' : undefined)
            }}
          />
          <Input value={a.nextStep ?? ''} placeholder="Nächster Schritt" aria-label="Chance: Nächster Schritt" onChange={(e) => set({ nextStep: e.target.value || null })} />
          <Input type="date" value={a.nextStepDate ?? ''} aria-label="Chance: Datum nächster Schritt" onChange={(e) => set({ nextStepDate: e.target.value || null })} />
        </div>
      )
    case 'opportunity.next_step':
      return (
        <div className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_11rem]">
          <Input value={a.nextStep} aria-label="Nächster Schritt" onChange={(e) => set({ nextStep: e.target.value }, e.target.value.trim() ? undefined : 'Darf nicht leer sein.')} />
          <Input type="date" value={a.nextStepDate ?? ''} aria-label="Datum nächster Schritt" onChange={(e) => set({ nextStepDate: e.target.value || null })} />
        </div>
      )
  }
}

function AnswerEditor({ action: a, set }: { action: Extract<ProposalAction, { type: 'discovery.answer' }>; set: (patch: Partial<ProposalAction>, invalid?: string) => void }) {
  const [text, setText] = useState(() => formatAnswer(a.value).replace('–', '-'))
  const question = { key: a.questionKey, prompt: a.questionPrompt, answerType: a.answerType, options: a.options }
  const hint = a.options.length ? `Optionen: ${a.options.join(', ')}` : a.answerType === 'range' ? 'z. B. 30-40' : a.answerType === 'boolean' ? 'ja oder nein' : null
  return (
    <div className="mt-1.5">
      <Input
        value={text}
        aria-label={`Antwort: ${a.questionPrompt}`}
        onChange={(e) => {
          setText(e.target.value)
          const raw = a.answerType === 'date' ? e.target.value.split('.').reverse().join('-') : e.target.value
          const value = coerceAnswer(question, raw)
          if (value == null) set({}, 'Diese Antwort passt nicht zum Fragetyp.')
          else set({ value: value as never })
        }}
      />
      {hint && <p className="mt-1 text-[12px] text-faint">{hint}</p>}
    </div>
  )
}
