'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useAction } from '@/components/forms/use-action'
import { formToObject, triState } from '@/components/forms/form-utils'
import { de } from '@/i18n/de'
import { COMPANY_STATUSES } from '@/domain/schemas'
import { createCompanyAction, updateCompanyAction } from './actions'

export interface CompanyFormValues {
  id?: string
  name?: string
  website?: string | null
  phone?: string | null
  city?: string | null
  industry?: string | null
  employeeCount?: number | null
  sizeClass?: string | null
  businessModel?: string | null
  hasProjectBusiness?: boolean | null
  hasQuoteBusiness?: boolean | null
  salesStructure?: string | null
  source?: string | null
  status?: (typeof COMPANY_STATUSES)[number]
  fitScore?: number | null
  recoveryUseCase?: string | null
}

export function CompanyFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: CompanyFormValues
}) {
  const router = useRouter()
  const editing = Boolean(initial?.id)
  const create = useAction(createCompanyAction, { success: 'Unternehmen angelegt.' })
  const update = useAction(updateCompanyAction, { success: 'Änderungen gespeichert.' })
  const { pending, fieldErrors } = editing ? update : create
  const [more, setMore] = useState(editing)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const v = formToObject(e.currentTarget)
    const data = {
      ...v,
      hasProjectBusiness: triState(v.hasProjectBusiness),
      hasQuoteBusiness: triState(v.hasQuoteBusiness),
      status: v.status ?? 'researched',
    }
    if (editing) {
      const r = await update.run({ id: initial!.id, data })
      if (r.ok) onOpenChange(false)
    } else {
      const r = await create.run(data)
      if (r.ok) {
        onOpenChange(false)
        router.push(`/unternehmen/${r.data.id}`)
      }
    }
  }

  const err = (k: string) => fieldErrors[k]
  const bool = (b: boolean | null | undefined) => (b == null ? '' : String(b))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? 'Unternehmen bearbeiten' : 'Neues Unternehmen'} wide>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Firmenname" htmlFor="c-name" error={err('name')} className="sm:col-span-2">
            <Input id="c-name" name="name" defaultValue={initial?.name ?? ''} required autoFocus aria-invalid={Boolean(err('name'))} />
          </Field>
          <Field label="Status" htmlFor="c-status">
            <Select id="c-status" name="status" defaultValue={initial?.status ?? 'researched'}>
              {COMPANY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {de.companyStatus[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Branche" htmlFor="c-industry" error={err('industry')}>
            <Input id="c-industry" name="industry" defaultValue={initial?.industry ?? ''} placeholder="z. B. Maschinenbau" />
          </Field>
          <Field label="Website" htmlFor="c-website" error={err('website')}>
            <Input id="c-website" name="website" defaultValue={initial?.website ?? ''} placeholder="beispiel.de" inputMode="url" />
          </Field>
          <Field label="Standort" htmlFor="c-city" error={err('city')}>
            <Input id="c-city" name="city" defaultValue={initial?.city ?? ''} />
          </Field>
          <Field label="Quelle" htmlFor="c-source" error={err('source')} hint="Woher kennst du das Unternehmen?">
            <Input id="c-source" name="source" defaultValue={initial?.source ?? ''} placeholder="z. B. Messe, Empfehlung" />
          </Field>
          <Field label="ReQover Fit (0–100)" htmlFor="c-fit" error={err('fitScore')}>
            <Input id="c-fit" name="fitScore" type="number" min={0} max={100} defaultValue={initial?.fitScore ?? ''} inputMode="numeric" />
          </Field>

          {!more ? (
            <button type="button" onClick={() => setMore(true)} className="text-left text-sm text-accent hover:underline sm:col-span-2">
              Weitere Angaben
            </button>
          ) : (
            <>
              <Field label="Telefon" htmlFor="c-phone" error={err('phone')}>
                <Input id="c-phone" name="phone" defaultValue={initial?.phone ?? ''} inputMode="tel" />
              </Field>
              <Field label="Mitarbeiterzahl" htmlFor="c-emp" error={err('employeeCount')}>
                <Input id="c-emp" name="employeeCount" type="number" min={0} defaultValue={initial?.employeeCount ?? ''} inputMode="numeric" />
              </Field>
              <Field label="Unternehmensgröße" htmlFor="c-size">
                <Input id="c-size" name="sizeClass" defaultValue={initial?.sizeClass ?? ''} placeholder="z. B. Mittelstand" />
              </Field>
              <Field label="Projektgeschäft" htmlFor="c-proj">
                <Select id="c-proj" name="hasProjectBusiness" defaultValue={bool(initial?.hasProjectBusiness)}>
                  <option value="">unbekannt</option>
                  <option value="true">Ja</option>
                  <option value="false">Nein</option>
                </Select>
              </Field>
              <Field label="Angebotsgeschäft" htmlFor="c-quote">
                <Select id="c-quote" name="hasQuoteBusiness" defaultValue={bool(initial?.hasQuoteBusiness)}>
                  <option value="">unbekannt</option>
                  <option value="true">Ja</option>
                  <option value="false">Nein</option>
                </Select>
              </Field>
              <Field label="Geschäftsmodell" htmlFor="c-bm" className="sm:col-span-2">
                <Textarea id="c-bm" name="businessModel" defaultValue={initial?.businessModel ?? ''} rows={2} />
              </Field>
              <Field label="Vertriebsstruktur" htmlFor="c-ss" className="sm:col-span-2">
                <Textarea id="c-ss" name="salesStructure" defaultValue={initial?.salesStructure ?? ''} rows={2} />
              </Field>
              <Field label="Recovery Use Case" htmlFor="c-ruc" className="sm:col-span-2">
                <Textarea id="c-ruc" name="recoveryUseCase" defaultValue={initial?.recoveryUseCase ?? ''} rows={2} />
              </Field>
            </>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {de.common.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {editing ? de.common.save : 'Unternehmen anlegen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Button + dialog; `autoOpen` lets the command bar open it via ?neu=1. */
export function NewCompanyButton({ autoOpen = false, label = 'Neues Unternehmen' }: { autoOpen?: boolean; label?: string }) {
  const [open, setOpen] = useState(autoOpen)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <CompanyFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
