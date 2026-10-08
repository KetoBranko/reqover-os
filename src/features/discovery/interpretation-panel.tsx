'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { useAction } from '@/components/forms/use-action'
import { cn } from '@/lib/cn'
import { de } from '@/i18n/de'
import { createInsightAction, deleteInsightAction, updateInsightAction } from '@/features/companies/actions'

export interface DiscoveryInsight {
  id: string
  kind: 'fact' | 'hypothesis' | 'customer_quote' | 'interpretation' | 'surprise'
  statement: string
  hypothesisStatus: 'open' | 'confirmed' | 'refuted' | null
  actor: 'human' | 'ai' | 'system'
}

/**
 * Section H: what the customer actually said vs. what we read into it,
 * plus assumptions that were confirmed or refuted and surprises.
 */
export function EvidenceVsInterpretation({ companyId, discoveryId, items, disabled }: { companyId: string; discoveryId: string; items: DiscoveryInsight[]; disabled?: boolean }) {
  const of = (k: DiscoveryInsight['kind']) => items.filter((i) => i.kind === k)
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Column title="Was hat der Kunde gesagt?" hint="Möglichst wörtlich. Nur Gesagtes, keine Deutung." kind="customer_quote" mark="mark-fact" items={of('customer_quote')} companyId={companyId} discoveryId={discoveryId} disabled={disabled} placeholder="„Bei uns bleiben bestimmt 60 Angebote liegen.“" />
        <Column title="Was interpretieren wir daraus?" hint="Unsere Schlussfolgerung, klar als Deutung erkennbar." kind="interpretation" mark="mark-hypothesis" items={of('interpretation')} companyId={companyId} discoveryId={discoveryId} disabled={disabled} placeholder="Hoher Backlog, vermutlich Kapazitätsproblem im Innendienst." />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Column title="Annahmen geprüft" hint="Vorher vermutet; im Gespräch bestätigt oder widerlegt." kind="hypothesis" mark="mark-hypothesis" items={of('hypothesis')} companyId={companyId} discoveryId={discoveryId} disabled={disabled} placeholder="Angebote werden nicht systematisch nachgefasst." />
        <Column title="Überraschende Erkenntnisse" hint="Was hast du nicht erwartet?" kind="surprise" mark="mark-fact" items={of('surprise')} companyId={companyId} discoveryId={discoveryId} disabled={disabled} placeholder="Datenschutz ist kein Thema, IT schon." />
      </div>
    </div>
  )
}

function Column({
  title,
  hint,
  kind,
  mark,
  items,
  companyId,
  discoveryId,
  disabled,
  placeholder,
}: {
  title: string
  hint: string
  kind: 'customer_quote' | 'interpretation' | 'hypothesis' | 'surprise'
  mark: string
  items: DiscoveryInsight[]
  companyId: string
  discoveryId: string
  disabled?: boolean
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const create = useAction(createInsightAction)
  async function add() {
    const statement = draft.trim()
    if (!statement) return
    const r = await create.run({ companyId, discoveryId, kind, statement, source: 'discovery', hypothesisStatus: kind === 'hypothesis' ? 'confirmed' : null })
    if (r.ok) setDraft('')
  }
  return (
    <Card className="p-4" aria-label={title}>
      <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <p className="mb-3 text-[12px] text-faint">{hint}</p>
      {items.length > 0 && (
        <ul className="mb-3 grid gap-2">
          {items.map((i) => (
            <Item key={i.id} item={i} mark={mark} disabled={disabled} />
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex items-end gap-2">
          <Textarea
            aria-label={`${title}: neuer Eintrag`}
            rows={2}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add()
            }}
            className="text-[13px]"
          />
          <Button size="icon-sm" variant="secondary" onClick={add} loading={create.pending} aria-label={`${title}: hinzufügen`}>
            <Plus />
          </Button>
        </div>
      )}
    </Card>
  )
}

function Item({ item, mark, disabled }: { item: DiscoveryInsight; mark: string; disabled?: boolean }) {
  const update = useAction(updateInsightAction)
  const remove = useAction(deleteInsightAction)
  return (
    <li className={cn('group rounded-r-md py-1 pl-3 pr-1', mark)}>
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm leading-relaxed">{item.statement}</p>
        {!disabled && (
          <button onClick={() => remove.run({ id: item.id })} className="rounded p-1 text-faint opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label="Eintrag löschen">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {item.kind === 'hypothesis' && (
        <div className="mt-1 flex gap-1.5">
          {(['confirmed', 'refuted', 'open'] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              aria-pressed={item.hypothesisStatus === s}
              onClick={() => update.run({ id: item.id, hypothesisStatus: s })}
              className={cn(
                'rounded-md px-2 py-0.5 text-[12px]',
                item.hypothesisStatus === s
                  ? s === 'confirmed'
                    ? 'bg-success-soft text-success'
                    : s === 'refuted'
                      ? 'bg-danger-soft text-danger'
                      : 'bg-surface-3 text-fg'
                  : 'text-faint hover:text-fg',
              )}
            >
              {de.hypothesisStatus[s]}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}
