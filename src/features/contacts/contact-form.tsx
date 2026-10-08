'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useAction } from '@/components/forms/use-action'
import { formToObject } from '@/components/forms/form-utils'
import { DECISION_ROLES, RELATIONSHIP_STATUSES } from '@/domain/schemas'
import { de } from '@/i18n/de'
import { createContactAction, updateContactAction } from './actions'

export interface ContactFormValues {
  id?: string
  companyId?: string
  firstName?: string
  lastName?: string
  jobTitle?: string | null
  phone?: string | null
  email?: string | null
  linkedinUrl?: string | null
  decisionRole?: (typeof DECISION_ROLES)[number]
  relationshipStatus?: (typeof RELATIONSHIP_STATUSES)[number]
  notes?: string | null
}

export function ContactFormDialog({
  open,
  onOpenChange,
  initial,
  companies,
  navigateOnCreate = false,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial?: ContactFormValues
  companies?: { id: string; name: string }[]
  navigateOnCreate?: boolean
}) {
  const router = useRouter()
  const editing = Boolean(initial?.id)
  const create = useAction(createContactAction, { success: 'Kontakt angelegt.' })
  const update = useAction(updateContactAction, { success: 'Kontakt gespeichert.' })
  const { pending, fieldErrors } = editing ? update : create

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const v = formToObject(e.currentTarget)
    const data = { ...v, firstName: v.firstName ?? '', companyId: v.companyId ?? initial?.companyId }
    if (editing) {
      const r = await update.run({ id: initial!.id, data })
      if (r.ok) onOpenChange(false)
    } else {
      const r = await create.run(data)
      if (r.ok) {
        onOpenChange(false)
        if (navigateOnCreate) router.push(`/kontakte/${r.data.id}`)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? 'Kontakt bearbeiten' : 'Neuer Kontakt'} wide>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          {companies && !initial?.companyId && (
            <Field label="Unternehmen" htmlFor="k-company" error={fieldErrors.companyId} className="sm:col-span-2">
              <Select id="k-company" name="companyId" defaultValue="" aria-invalid={Boolean(fieldErrors.companyId)}>
                <option value="" disabled>
                  Bitte wählen
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Vorname" htmlFor="k-first">
            <Input id="k-first" name="firstName" defaultValue={initial?.firstName ?? ''} autoFocus />
          </Field>
          <Field label="Nachname" htmlFor="k-last" error={fieldErrors.lastName}>
            <Input id="k-last" name="lastName" defaultValue={initial?.lastName ?? ''} aria-invalid={Boolean(fieldErrors.lastName)} />
          </Field>
          <Field label="Funktion" htmlFor="k-title">
            <Input id="k-title" name="jobTitle" defaultValue={initial?.jobTitle ?? ''} placeholder="z. B. Vertriebsleiter" />
          </Field>
          <Field label="Entscheiderrolle" htmlFor="k-role">
            <Select id="k-role" name="decisionRole" defaultValue={initial?.decisionRole ?? 'unknown'}>
              {DECISION_ROLES.map((r) => (
                <option key={r} value={r}>
                  {de.decisionRole[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Telefon" htmlFor="k-phone">
            <Input id="k-phone" name="phone" defaultValue={initial?.phone ?? ''} inputMode="tel" />
          </Field>
          <Field label="E-Mail" htmlFor="k-email" error={fieldErrors.email}>
            <Input id="k-email" name="email" type="email" defaultValue={initial?.email ?? ''} inputMode="email" />
          </Field>
          <Field label="LinkedIn" htmlFor="k-li" error={fieldErrors.linkedinUrl}>
            <Input id="k-li" name="linkedinUrl" defaultValue={initial?.linkedinUrl ?? ''} inputMode="url" />
          </Field>
          <Field label="Beziehungsstatus" htmlFor="k-rel">
            <Select id="k-rel" name="relationshipStatus" defaultValue={initial?.relationshipStatus ?? 'new'}>
              {RELATIONSHIP_STATUSES.map((r) => (
                <option key={r} value={r}>
                  {de.relationshipStatus[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notizen" htmlFor="k-notes" className="sm:col-span-2">
            <Textarea id="k-notes" name="notes" defaultValue={initial?.notes ?? ''} rows={3} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {de.common.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {editing ? de.common.save : 'Kontakt anlegen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function NewContactButton({
  label = 'Neuer Kontakt',
  variant = 'primary',
  autoOpen = false,
  ...props
}: { label?: string; variant?: 'primary' | 'secondary'; autoOpen?: boolean } & Omit<React.ComponentProps<typeof ContactFormDialog>, 'open' | 'onOpenChange'>) {
  const [open, setOpen] = useState(autoOpen)
  return (
    <>
      <Button variant={variant} size={variant === 'primary' ? 'md' : 'sm'} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <ContactFormDialog open={open} onOpenChange={setOpen} {...props} />}
    </>
  )
}

export function EditContactButton({ initial }: { initial: ContactFormValues }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {de.common.edit}
      </Button>
      {open && <ContactFormDialog open={open} onOpenChange={setOpen} initial={initial} />}
    </>
  )
}
