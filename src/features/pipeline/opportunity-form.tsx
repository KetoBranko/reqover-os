'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { useAction } from '@/components/forms/use-action'
import { formToObject } from '@/components/forms/form-utils'
import { PIPELINE_STAGE_KEYS, type PipelineStageKey } from '@/domain/schemas'
import { formatMoney, parseMoneyToCents } from '@/lib/format'
import { de } from '@/i18n/de'
import { createOpportunityAction, updateOpportunityAction } from './actions'

export interface Option {
  id: string
  name: string
  companyId?: string
}

export interface OpportunityFormValues {
  id?: string
  companyId?: string
  title?: string
  stageKey?: PipelineStageKey
  primaryContactId?: string | null
  valueCents?: number | null
  nextStep?: string | null
  nextStepDate?: string | null
}

const OPEN_STAGES = PIPELINE_STAGE_KEYS.filter((k) => k !== 'won' && k !== 'lost')

export function OpportunityFormDialog({
  open,
  onOpenChange,
  initial,
  companies,
  contacts,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial?: OpportunityFormValues
  companies?: Option[]
  contacts?: Option[]
}) {
  const editing = Boolean(initial?.id)
  const create = useAction(createOpportunityAction, { success: 'Chance angelegt.' })
  const update = useAction(updateOpportunityAction, { success: 'Chance gespeichert.' })
  const { pending, fieldErrors } = editing ? update : create
  const [companyId, setCompanyId] = useState(initial?.companyId ?? '')
  const [valueError, setValueError] = useState<string | null>(null)
  const visibleContacts = contacts?.filter((c) => c.companyId === companyId)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const v = formToObject(e.currentTarget)
    const valueCents = v.value ? parseMoneyToCents(v.value) : null
    if (v.value && valueCents == null) {
      setValueError('Bitte einen Betrag wie 2.500 eingeben.')
      return
    }
    setValueError(null)
    const common = {
      title: v.title ?? '',
      primaryContactId: v.primaryContactId ?? null,
      valueCents,
      nextStep: v.nextStep ?? null,
      nextStepDate: v.nextStepDate ?? null,
    }
    const r = editing
      ? await update.run({ id: initial!.id, data: common })
      : await create.run({ ...common, companyId: companyId || initial?.companyId || '', stageKey: v.stageKey ?? 'to_contact' })
    if (r.ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? 'Chance bearbeiten' : 'Neue Chance'}>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {!editing && companies && (
            <Field label="Unternehmen" htmlFor="o-company" error={fieldErrors.companyId}>
              <Select id="o-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-invalid={Boolean(fieldErrors.companyId)}>
                <option value="">Bitte wählen …</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Titel" htmlFor="o-title" error={fieldErrors.title}>
            <Input id="o-title" name="title" defaultValue={initial?.title ?? 'Pilot Sales Recovery'} autoFocus aria-invalid={Boolean(fieldErrors.title)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Wert (€)" htmlFor="o-value" error={valueError ?? fieldErrors.valueCents} hint="Erwarteter Auftragswert">
              <Input
                id="o-value"
                name="value"
                inputMode="decimal"
                placeholder="z. B. 2.500"
                defaultValue={initial?.valueCents != null ? formatMoney(initial.valueCents).replace(/\s?€/, '') : ''}
              />
            </Field>
            {!editing && (
              <Field label="Phase" htmlFor="o-stage">
                <Select id="o-stage" name="stageKey" defaultValue={initial?.stageKey ?? 'to_contact'}>
                  {OPEN_STAGES.map((k) => (
                    <option key={k} value={k}>
                      {de.pipelineStage[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {visibleContacts && visibleContacts.length > 0 && (
              <Field label="Ansprechpartner" htmlFor="o-contact">
                <Select id="o-contact" name="primaryContactId" defaultValue={initial?.primaryContactId ?? ''}>
                  <option value="">– ohne –</option>
                  {visibleContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="Nächster Schritt" htmlFor="o-next" error={fieldErrors.nextStep}>
              <Input id="o-next" name="nextStep" defaultValue={initial?.nextStep ?? ''} placeholder="z. B. Discovery-Termin vereinbaren" />
            </Field>
            <Field label="bis" htmlFor="o-next-date" error={fieldErrors.nextStepDate}>
              <Input id="o-next-date" name="nextStepDate" type="date" defaultValue={initial?.nextStepDate ?? ''} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {de.common.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {editing ? de.common.save : 'Chance anlegen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function NewOpportunityButton({
  label = 'Neue Chance',
  variant = 'primary',
  autoOpen = false,
  ...props
}: { label?: string; variant?: 'primary' | 'secondary'; autoOpen?: boolean; initial?: OpportunityFormValues; companies?: Option[]; contacts?: Option[] }) {
  const [open, setOpen] = useState(autoOpen)
  return (
    <>
      <Button variant={variant} size={variant === 'primary' ? 'md' : 'sm'} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <OpportunityFormDialog open={open} onOpenChange={setOpen} {...props} />}
    </>
  )
}
