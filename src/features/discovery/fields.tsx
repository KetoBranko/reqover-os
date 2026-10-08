'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/input'
import { SAVE_LABEL, useAutosave, type SaveState } from '@/components/forms/use-autosave'
import { cn } from '@/lib/cn'
import { parseRange, type AnswerType } from '@/domain/discovery'
import { formatNumber } from '@/lib/format'
import type { DiscoveryNotes } from '@/domain/schemas'
import { saveAnswerAction, saveDiscoveryNotesAction } from './actions'

export function SaveHint({ state, className }: { state: SaveState; className?: string }) {
  if (state === 'idle') return null
  return (
    <span role="status" className={cn('text-[12px]', state === 'error' ? 'text-danger' : 'text-faint', className)}>
      {SAVE_LABEL[state]}
    </span>
  )
}

type TextNoteKey = 'rawNotes' | 'coreQuestionAnswer' | 'summary' | 'mainPain' | 'recoveryUseCase'

/** Autosaving long text field bound to one column of the interview. */
export function NoteField({
  discoveryId,
  field,
  label,
  hint,
  initial,
  rows = 4,
  placeholder,
  disabled,
  big,
}: {
  discoveryId: string
  field: TextNoteKey
  label: string
  hint?: string
  initial: string | null
  rows?: number
  placeholder?: string
  disabled?: boolean
  big?: boolean
}) {
  const [value, setValue] = useState(initial ?? '')
  const save = useAutosave((v: string) => saveDiscoveryNotesAction({ id: discoveryId, data: { [field]: v } satisfies DiscoveryNotes }))
  const id = `n-${field}`
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-muted">
          {label}
        </label>
        <SaveHint state={save.state} />
      </div>
      <Textarea
        id={id}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value)
          save.schedule(e.target.value)
        }}
        onBlur={() => save.state === 'saving' && void save.flush(value)}
        className={cn(big && 'text-[15px] leading-relaxed')}
      />
      {hint && <p className="text-[12px] text-faint">{hint}</p>}
    </div>
  )
}

type ListKey = 'objections' | 'externalizationConcerns' | 'desiredKpis'

/** Small tag list (Einwände, Bedenken, KPIs); saved on every change. */
export function ListField({ discoveryId, field, label, initial, placeholder, disabled }: { discoveryId: string; field: ListKey; label: string; initial: string[]; placeholder: string; disabled?: boolean }) {
  const [items, setItems] = useState(initial)
  const [draft, setDraft] = useState('')
  const save = useAutosave((v: string[]) => saveDiscoveryNotesAction({ id: discoveryId, data: { [field]: v } }), 0)
  function update(next: string[]) {
    setItems(next)
    void save.flush(next)
  }
  function add() {
    const v = draft.trim()
    if (!v || items.includes(v)) return setDraft('')
    update([...items, v])
    setDraft('')
  }
  const id = `l-${field}`
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-muted">
          {label}
        </label>
        <SaveHint state={save.state} />
      </div>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-0.5 pl-2.5 pr-1 text-[13px]">
              {t}
              {!disabled && (
                <button type="button" onClick={() => update(items.filter((x) => x !== t))} aria-label={`${t} entfernen`} className="rounded-full p-0.5 text-faint hover:text-danger">
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
        />
      )}
    </div>
  )
}

export interface QuestionRow {
  key: string
  prompt: string
  answerType: string
  options: string[]
  isCore: boolean
}

export interface AnswerRow {
  value: unknown
  verbatim: string | null
  isUncertain: boolean
  source: 'human' | 'ai' | 'system'
}

function rangeText(v: unknown): string {
  if (!v || typeof v !== 'object') return ''
  const { min, max } = v as { min: number | null; max: number | null }
  if (min != null && max != null) return min === max ? formatNumber(min) : `${formatNumber(min)}–${formatNumber(max)}`
  return formatNumber((min ?? max) as number)
}

/** One catalog question with an input that matches its answer type. */
export function QuestionField({ discoveryId, question, answer, disabled }: { discoveryId: string; question: QuestionRow; answer?: AnswerRow; disabled?: boolean }) {
  const type = question.answerType as AnswerType
  const [text, setText] = useState(() =>
    answer?.verbatim ?? (type === 'range' ? rangeText(answer?.value) : typeof answer?.value === 'string' || typeof answer?.value === 'number' ? String(answer.value) : ''),
  )
  const [value, setValue] = useState<unknown>(answer?.value ?? null)
  const [uncertain, setUncertain] = useState(answer?.isUncertain ?? false)
  const [error, setError] = useState<string | null>(null)
  const save = useAutosave((p: { value: unknown; verbatim: string | null; isUncertain: boolean }) =>
    saveAnswerAction({ discoveryId, questionKey: question.key, ...p }),
  )
  const id = `q-${question.key}`

  function commitText(raw: string, immediate = false) {
    setText(raw)
    setError(null)
    let next: unknown = null
    let verbatim: string | null = null
    const t = raw.trim()
    if (t) {
      if (type === 'range') {
        const r = parseRange(t)
        if (!r) return setError('Bitte eine Zahl oder Spanne wie „30 bis 40“ eingeben.')
        next = r
        verbatim = t
      } else if (type === 'number') {
        const n = Number(t.replace(/\./g, '').replace(',', '.'))
        if (!Number.isFinite(n) || n < 0) return setError('Bitte eine Zahl eingeben.')
        next = n
      } else next = t
    }
    setValue(next)
    const payload = { value: next, verbatim, isUncertain: uncertain }
    if (immediate) void save.flush(payload)
    else save.schedule(payload)
  }

  function commitValue(next: unknown) {
    setValue(next)
    void save.flush({ value: next, verbatim: null, isUncertain: uncertain })
  }

  return (
    <div className="grid gap-1.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={id} className="text-sm leading-snug text-fg">
          {question.prompt}
          {answer?.source === 'ai' && <span className="ml-2 text-[11px] font-semibold uppercase text-accent">AI</span>}
        </label>
        <SaveHint state={save.state} className="shrink-0" />
      </div>
      {type === 'boolean' ? (
        <div role="radiogroup" aria-labelledby={id} className="flex gap-1.5" id={id}>
          {[
            { v: true, l: 'Ja' },
            { v: false, l: 'Nein' },
            { v: null, l: 'Offen' },
          ].map((o) => (
            <Chip key={o.l} active={value === o.v} disabled={disabled} onClick={() => commitValue(o.v)}>
              {o.l}
            </Chip>
          ))}
        </div>
      ) : type === 'choice' || type === 'multi_choice' ? (
        <div className="flex flex-wrap gap-1.5" id={id} role="group" aria-label={question.prompt}>
          {question.options.map((o) => {
            const selected = type === 'choice' ? value === o : Array.isArray(value) && value.includes(o)
            return (
              <Chip
                key={o}
                active={selected}
                disabled={disabled}
                onClick={() => {
                  if (type === 'choice') commitValue(selected ? null : o)
                  else {
                    const cur = Array.isArray(value) ? (value as string[]) : []
                    const next = selected ? cur.filter((x) => x !== o) : [...cur, o]
                    commitValue(next.length ? next : null)
                  }
                }}
              >
                {o}
              </Chip>
            )
          })}
        </div>
      ) : type === 'date' ? (
        <Input id={id} type="date" disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={(e) => commitValue(e.target.value || null)} className="max-w-48" />
      ) : type === 'long_text' ? (
        <Textarea id={id} rows={2} disabled={disabled} value={text} onChange={(e) => commitText(e.target.value)} />
      ) : (
        <Input
          id={id}
          disabled={disabled}
          value={text}
          inputMode={type === 'number' ? 'numeric' : undefined}
          placeholder={type === 'range' ? 'z. B. 30 bis 40' : undefined}
          onChange={(e) => (type === 'text' ? commitText(e.target.value) : setText(e.target.value))}
          onBlur={(e) => type !== 'text' && commitText(e.target.value, true)}
          aria-invalid={Boolean(error)}
        />
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
      {value != null && type !== 'boolean' && (
        <label className="flex w-fit items-center gap-2 text-[12px] text-faint">
          <input
            type="checkbox"
            checked={uncertain}
            disabled={disabled}
            onChange={(e) => {
              setUncertain(e.target.checked)
              void save.flush({ value, verbatim: type === 'range' ? text.trim() || null : null, isUncertain: e.target.checked })
            }}
            className="accent-[var(--warning)]"
          />
          Unsichere Angabe
        </label>
      )}
    </div>
  )
}

export function Chip({ active, disabled, onClick, children, tone = 'accent' }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; tone?: 'accent' | 'success' | 'danger' }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-8 rounded-full border px-3 text-[13px] transition-colors disabled:opacity-50',
        active
          ? tone === 'success'
            ? 'border-success/50 bg-success-soft text-success'
            : tone === 'danger'
              ? 'border-danger/50 bg-danger-soft text-danger'
              : 'border-accent/50 bg-accent-soft text-accent'
          : 'border-line text-muted hover:border-line-strong hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}
