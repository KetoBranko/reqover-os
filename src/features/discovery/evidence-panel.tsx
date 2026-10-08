'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { useAutosave } from '@/components/forms/use-autosave'
import { cn } from '@/lib/cn'
import { de } from '@/i18n/de'
import { EVIDENCE_RUBRIC, SIGNALS, evidenceTotal, type EvidenceCategory, type SignalKey, type SignalValue } from '@/domain/discovery'
import { setEvidenceAction, setSignalAction } from './actions'
import { Chip, SaveHint } from './fields'

export function SignalsPanel({ discoveryId, initial, disabled }: { discoveryId: string; initial: Record<SignalKey, SignalValue>; disabled?: boolean }) {
  const [values, setValues] = useState(initial)
  const save = useAutosave((p: { signal: SignalKey; value: SignalValue }) => setSignalAction({ discoveryId, ...p }), 0)
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">Validierungssignale</h3>
        <SaveHint state={save.state} />
      </div>
      <p className="mb-3 text-[12px] text-faint">Fließen in die Validierungsauswertung ein. „Unklar“, solange es nicht ausgesprochen wurde.</p>
      <ul className="divide-y divide-line">
        {SIGNALS.map(({ key }) => (
          <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="text-sm">{de.signalName[key]}</span>
            <div className="flex gap-1.5" role="radiogroup" aria-label={de.signalName[key]}>
              {(['yes', 'no', 'unclear'] as const).map((v) => (
                <Chip
                  key={v}
                  active={values[key] === v}
                  disabled={disabled}
                  tone={v === 'yes' ? 'success' : v === 'no' ? 'danger' : 'accent'}
                  onClick={() => {
                    setValues((s) => ({ ...s, [key]: v }))
                    void save.flush({ signal: key, value: v })
                  }}
                >
                  {de.signal[v]}
                </Chip>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export interface EvidenceRow {
  category: EvidenceCategory
  points: number | null
  suggestedPoints: number | null
  evidence: string | null
  rationale: string | null
  suggestedBy: 'human' | 'ai' | 'system' | null
}

/**
 * Evidence Score 0–20. Every rating is a human confirmation; AI suggestions
 * (later phase) appear as "Vorschlag" until someone accepts or changes them.
 */
export function EvidenceScorePanel({ discoveryId, initial, disabled }: { discoveryId: string; initial: EvidenceRow[]; disabled?: boolean }) {
  const [rows, setRows] = useState(initial)
  const total = evidenceTotal(rows)
  const update = (category: EvidenceCategory, patch: Partial<EvidenceRow>) => setRows((rs) => rs.map((r) => (r.category === category ? { ...r, ...patch } : r)))
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">Evidence Score</h3>
          <p className="text-[12px] text-faint">10 Kategorien à 0–2 Punkte. Begründe jede Bewertung mit einer Kundenaussage oder einem Grund.</p>
        </div>
        <p className="tabular text-right" aria-live="polite">
          <span className="text-2xl font-semibold">{total.points}</span>
          <span className="text-muted">/{total.max}</span>
          <span className="block text-[12px] text-faint">{total.complete ? 'vollständig bewertet' : `${total.rated} von 10 bewertet`}</span>
        </p>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((r) => (
          <EvidenceItem key={r.category} discoveryId={discoveryId} row={r} disabled={disabled} onChange={(p) => update(r.category, p)} />
        ))}
      </ul>
    </Card>
  )
}

function EvidenceItem({ discoveryId, row, disabled, onChange }: { discoveryId: string; row: EvidenceRow; disabled?: boolean; onChange: (p: Partial<EvidenceRow>) => void }) {
  const rubric = EVIDENCE_RUBRIC[row.category]
  const [open, setOpen] = useState(Boolean(row.evidence || row.rationale))
  const save = useAutosave((r: EvidenceRow) => setEvidenceAction({ discoveryId, category: r.category, points: r.points, evidence: r.evidence, rationale: r.rationale }))
  const label = de.evidenceCategory[row.category]

  function set(patch: Partial<EvidenceRow>, immediate: boolean) {
    const next = { ...row, ...patch }
    onChange(patch)
    if (immediate) void save.flush(next)
    else save.schedule(next)
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-[12px] text-faint">{rubric.question}</p>
        </div>
        <div className="flex items-center gap-2">
          <SaveHint state={save.state} />
          <div className="flex gap-1" role="radiogroup" aria-label={`${label}: Punkte`}>
            {[0, 1, 2].map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={row.points === p}
                disabled={disabled}
                title={rubric.levels[p]}
                aria-label={`${p} ${p === 1 ? 'Punkt' : 'Punkte'}: ${rubric.levels[p]}`}
                onClick={() => {
                  set({ points: row.points === p ? null : p }, true)
                  if (row.points !== p) setOpen(true)
                }}
                className={cn(
                  'grid size-9 place-items-center rounded-lg border text-sm tabular transition-colors disabled:opacity-50',
                  row.points === p ? 'border-accent/60 bg-accent-soft font-semibold text-accent' : 'border-line text-muted hover:border-line-strong hover:text-fg',
                  row.points == null && row.suggestedPoints === p && 'border-dashed border-accent/50',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      {row.points != null && <p className="mt-1 text-[12px] text-muted">{rubric.levels[row.points]}</p>}
      {row.points == null && row.suggestedPoints != null && (
        <p className="mt-1 text-[12px] text-accent">Vorschlag: {row.suggestedPoints}/2 – bitte bestätigen oder ändern</p>
      )}
      {open ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Textarea
            aria-label={`${label}: Kundenaussage`}
            rows={2}
            disabled={disabled}
            placeholder="Evidence: Was hat der Kunde wörtlich gesagt?"
            value={row.evidence ?? ''}
            onChange={(e) => set({ evidence: e.target.value || null }, false)}
            className="mark-fact text-[13px]"
          />
          <Textarea
            aria-label={`${label}: Begründung`}
            rows={2}
            disabled={disabled}
            placeholder="Begründung: Warum diese Punktzahl?"
            value={row.rationale ?? ''}
            onChange={(e) => set({ rationale: e.target.value || null }, false)}
            className="mark-hypothesis text-[13px]"
          />
        </div>
      ) : (
        !disabled && (
          <button type="button" onClick={() => setOpen(true)} className="mt-1 text-[12px] text-faint hover:text-accent">
            Beleg hinzufügen
          </button>
        )
      )}
    </li>
  )
}
