'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Select, Textarea } from '@/components/ui/input'
import { useAction } from '@/components/forms/use-action'
import { cn } from '@/lib/cn'
import { de } from '@/i18n/de'
import { HYPOTHESIS_STATUSES, INSIGHT_SOURCES } from '@/domain/schemas'
import { createInsightAction, deleteInsightAction, updateInsightAction } from './actions'

export interface InsightRow {
  id: string
  kind: 'fact' | 'hypothesis' | 'customer_quote' | 'interpretation' | 'surprise'
  statement: string
  source: (typeof INSIGHT_SOURCES)[number]
  sourceDetail: string | null
  hypothesisStatus: (typeof HYPOTHESIS_STATUSES)[number] | null
  isUncertain: boolean
  actor: 'human' | 'ai' | 'system'
}

/** Facts and hypotheses side by side, visibly different (label + rule style, not only colour). */
export function FactsAndHypotheses({ companyId, insights }: { companyId: string; insights: InsightRow[] }) {
  const facts = insights.filter((i) => i.kind === 'fact')
  const hypotheses = insights.filter((i) => i.kind === 'hypothesis')
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InsightColumn
        title="Fakten"
        hint="Belegte Aussagen über das Unternehmen."
        kind="fact"
        companyId={companyId}
        items={facts}
        empty="Noch keine Fakten erfasst. Unbekanntes bleibt leer, nichts wird geschätzt."
      />
      <InsightColumn
        title="Hypothesen"
        hint="Annahmen, die sich bestätigen oder widerlegen müssen."
        kind="hypothesis"
        companyId={companyId}
        items={hypotheses}
        empty="Noch keine Hypothesen. Was vermutest du, das ein Gespräch klären sollte?"
      />
    </div>
  )
}

function InsightColumn({
  title,
  hint,
  kind,
  companyId,
  items,
  empty,
}: {
  title: string
  hint: string
  kind: 'fact' | 'hypothesis'
  companyId: string
  items: InsightRow[]
  empty: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
          <p className="text-[12px] text-faint">{hint}</p>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`${kind === 'fact' ? 'Fakt' : 'Hypothese'} hinzufügen`}>
          <Plus />
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-faint">{empty}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((i) => (
            <InsightItem key={i.id} insight={i} />
          ))}
        </ul>
      )}
      {open && <InsightDialog open={open} onOpenChange={setOpen} companyId={companyId} kind={kind} />}
    </section>
  )
}

function InsightItem({ insight }: { insight: InsightRow }) {
  const update = useAction(updateInsightAction)
  const remove = useAction(deleteInsightAction)
  const isHypothesis = insight.kind === 'hypothesis'
  return (
    <li className={cn('group rounded-r-md py-1 pl-3 pr-1', isHypothesis ? 'mark-hypothesis' : 'mark-fact')}>
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm leading-relaxed">{insight.statement}</p>
        <button
          onClick={() => remove.run({ id: insight.id })}
          className="rounded p-1 text-faint opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"
          aria-label="Eintrag löschen"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-faint">
        <span>{de.insightKind[insight.kind]}</span>
        <span>· {de.insightSource[insight.source]}</span>
        {insight.sourceDetail && <span>· {insight.sourceDetail}</span>}
        {insight.isUncertain && <Badge tone="warning">unsicher</Badge>}
        {insight.actor === 'ai' && <Badge tone="accent">AI</Badge>}
        {isHypothesis && (
          <select
            aria-label="Status der Hypothese"
            value={insight.hypothesisStatus ?? 'open'}
            onChange={(e) => update.run({ id: insight.id, hypothesisStatus: e.target.value })}
            className={cn(
              'ml-auto rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[12px]',
              insight.hypothesisStatus === 'confirmed' && 'text-success',
              insight.hypothesisStatus === 'refuted' && 'text-danger',
            )}
          >
            {HYPOTHESIS_STATUSES.map((s) => (
              <option key={s} value={s}>
                {de.hypothesisStatus[s]}
              </option>
            ))}
          </select>
        )}
      </div>
    </li>
  )
}

function InsightDialog({ open, onOpenChange, companyId, kind }: { open: boolean; onOpenChange: (o: boolean) => void; companyId: string; kind: 'fact' | 'hypothesis' }) {
  const create = useAction(createInsightAction, { success: kind === 'fact' ? 'Fakt gespeichert.' : 'Hypothese gespeichert.' })
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const r = await create.run({
      companyId,
      kind,
      statement: f.get('statement'),
      source: f.get('source') || 'manual',
      sourceDetail: f.get('sourceDetail') || null,
    })
    if (r.ok) onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={kind === 'fact' ? 'Fakt hinzufügen' : 'Hypothese hinzufügen'}>
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label={kind === 'fact' ? 'Was ist belegt?' : 'Was vermutest du?'} htmlFor="i-statement" error={create.fieldErrors.statement}>
            <Textarea
              id="i-statement"
              name="statement"
              rows={3}
              autoFocus
              placeholder={
                kind === 'fact'
                  ? 'z. B. Unternehmen fertigt kundenspezifische Sondermaschinen.'
                  : 'z. B. Längere Sales Cycles könnten zu älteren offenen Opportunities führen.'
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quelle" htmlFor="i-source">
              <Select id="i-source" name="source" defaultValue="manual">
                {INSIGHT_SOURCES.filter((s) => s !== 'ai').map((s) => (
                  <option key={s} value={s}>
                    {de.insightSource[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Beleg / Detail" htmlFor="i-detail">
              <Textarea id="i-detail" name="sourceDetail" rows={1} className="min-h-10" placeholder="z. B. Website, Seite Über uns" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {de.common.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={create.pending}>
              {de.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
