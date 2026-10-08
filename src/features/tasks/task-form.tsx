'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useAction } from '@/components/forms/use-action'
import { formToObject } from '@/components/forms/form-utils'
import { TASK_PRIORITIES } from '@/domain/schemas'
import { de } from '@/i18n/de'
import { createTaskAction, updateTaskAction } from './actions'

export interface TaskFormValues {
  id?: string
  title?: string
  description?: string | null
  context?: string | null
  dueDate?: string | null
  priority?: (typeof TASK_PRIORITIES)[number]
  companyId?: string | null
  contactId?: string | null
  opportunityId?: string | null
  discoveryId?: string | null
}

export interface Option {
  id: string
  name: string
  companyId?: string
}

export function TaskFormDialog({
  open,
  onOpenChange,
  initial,
  companies,
  contacts,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial?: TaskFormValues
  companies?: Option[]
  contacts?: Option[]
}) {
  const editing = Boolean(initial?.id)
  const create = useAction(createTaskAction, { success: 'Aufgabe erstellt.' })
  const update = useAction(updateTaskAction, { success: 'Aufgabe gespeichert.' })
  const { pending, fieldErrors } = editing ? update : create
  const [companyId, setCompanyId] = useState(initial?.companyId ?? '')
  const visibleContacts = contacts?.filter((c) => !companyId || c.companyId === companyId)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const v = formToObject(e.currentTarget)
    const data = {
      ...v,
      priority: v.priority ?? 'normal',
      companyId: v.companyId ?? initial?.companyId ?? null,
      contactId: v.contactId ?? initial?.contactId ?? null,
      opportunityId: initial?.opportunityId ?? null,
      discoveryId: initial?.discoveryId ?? null,
    }
    const r = editing ? await update.run({ id: initial!.id, data }) : await create.run(data)
    if (r.ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field label="Was ist zu tun?" htmlFor="t-title" error={fieldErrors.title}>
            <Input id="t-title" name="title" defaultValue={initial?.title ?? ''} autoFocus placeholder="z. B. Herrn Müller anrufen" aria-invalid={Boolean(fieldErrors.title)} />
          </Field>
          <Field label="Grund / Kontext" htmlFor="t-context" hint="Warum ist das wichtig? Hilft beim Priorisieren.">
            <Input id="t-context" name="context" defaultValue={initial?.context ?? ''} placeholder="z. B. Datenschutzfragen nach Discovery klären" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fällig am" htmlFor="t-due" error={fieldErrors.dueDate}>
              <Input id="t-due" name="dueDate" type="date" defaultValue={initial?.dueDate ?? ''} />
            </Field>
            <Field label="Priorität" htmlFor="t-prio">
              <Select id="t-prio" name="priority" defaultValue={initial?.priority ?? 'normal'}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {de.taskPriority[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {companies && (
            <Field label="Unternehmen" htmlFor="t-company">
              <Select id="t-company" name="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">– ohne –</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {visibleContacts && visibleContacts.length > 0 && (
            <Field label="Kontakt" htmlFor="t-contact">
              <Select id="t-contact" name="contactId" defaultValue={initial?.contactId ?? ''}>
                <option value="">– ohne –</option>
                {visibleContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Beschreibung" htmlFor="t-desc">
            <Textarea id="t-desc" name="description" defaultValue={initial?.description ?? ''} rows={2} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {de.common.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {editing ? de.common.save : 'Aufgabe erstellen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function NewTaskButton({
  label = 'Neue Aufgabe',
  variant = 'primary',
  autoOpen = false,
  ...props
}: { label?: string; variant?: 'primary' | 'secondary' | 'outline'; autoOpen?: boolean; initial?: TaskFormValues; companies?: Option[]; contacts?: Option[] }) {
  const [open, setOpen] = useState(autoOpen)
  return (
    <>
      <Button variant={variant} size={variant === 'primary' ? 'md' : 'sm'} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <TaskFormDialog open={open} onOpenChange={setOpen} {...props} />}
    </>
  )
}
