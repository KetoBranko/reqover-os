'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { berlinDay } from '@/lib/format'
import { de } from '@/i18n/de'

const LOST_REASONS = ['Kein Budget', 'Kein akutes Problem', 'Macht es selbst', 'Datenschutzbedenken', 'Kein Entscheider erreichbar', 'Anderer Anbieter']

/**
 * Data-quality gate for closing an opportunity. "Gewonnen" needs a documented
 * order date, "Verloren" a reason. The server enforces the same rules.
 */
export function OutcomeDialog({
  outcome,
  title,
  pending,
  onConfirm,
  onCancel,
}: {
  outcome: 'won' | 'lost'
  title: string
  pending: boolean
  onConfirm: (data: { orderConfirmedAt?: string; lostReason?: string; wonWithoutOrder?: boolean }) => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(berlinDay())
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (outcome === 'won') {
      if (!date) return setError('Bitte das Datum der Auftragsbestätigung angeben.')
      onConfirm({ orderConfirmedAt: date })
    } else {
      if (!reason.trim()) return setError('Bitte einen Grund angeben. Er hilft später bei der Auswertung.')
      onConfirm({ lostReason: reason.trim() })
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        title={outcome === 'won' ? `„${title}“ als ${de.pipelineStage.won} markieren` : `„${title}“ als ${de.pipelineStage.lost} markieren`}
        description={
          outcome === 'won'
            ? 'Eine bestätigte Beauftragung ist nicht hinterlegt. Wann wurde der Auftrag bestätigt?'
            : 'Warum ist die Chance verloren? Der Grund fließt in die Validierung ein.'
        }
      >
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {outcome === 'won' ? (
            <Field label="Auftrag bestätigt am" htmlFor="oc-date" error={error ?? undefined}>
              <Input id="oc-date" type="date" value={date} max={berlinDay()} onChange={(e) => setDate(e.target.value)} autoFocus />
            </Field>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5" aria-label="Häufige Gründe">
                {LOST_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className="h-8 rounded-full border border-line px-3 text-[13px] text-muted hover:border-line-strong hover:text-fg aria-pressed:border-accent/50 aria-pressed:text-accent"
                    aria-pressed={reason === r}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <Field label="Grund" htmlFor="oc-reason" error={error ?? undefined}>
                <Textarea id="oc-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
              </Field>
            </>
          )}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {de.common.cancel}
            </Button>
            {outcome === 'won' && (
              <Button type="button" variant="outline" disabled={pending} onClick={() => onConfirm({ wonWithoutOrder: true })}>
                Trotzdem als gewonnen markieren
              </Button>
            )}
            <Button type="submit" variant={outcome === 'won' ? 'primary' : 'danger'} loading={pending}>
              {outcome === 'won' ? 'Mit Auftrag speichern' : 'Als verloren speichern'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
