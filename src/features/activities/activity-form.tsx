'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { appendText, DictateButton } from '@/features/voice/dictate'
import { useAction } from '@/components/forms/use-action'
import { MANUAL_ACTIVITY_TYPES } from '@/domain/schemas'
import { de } from '@/i18n/de'
import { createActivityAction } from './actions'

type ManualType = (typeof MANUAL_ACTIVITY_TYPES)[number]

const DEFAULT_TITLES: Record<ManualType, string> = {
  call: 'Telefonat',
  meeting: 'Meeting',
  email: 'E-Mail',
  note: 'Notiz',
}

function localDateTimeValue(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ActivityFormDialog({
  open,
  onOpenChange,
  companyId,
  contactId,
  opportunityId,
  taskId,
  defaultType = 'note',
  defaultTitle,
  contacts,
  bodySlot,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  companyId?: string | null
  contactId?: string | null
  opportunityId?: string | null
  taskId?: string | null
  defaultType?: ManualType
  defaultTitle?: string
  contacts?: { id: string; name: string }[]
  bodySlot?: (setBody: (text: string) => void) => React.ReactNode
}) {
  const create = useAction(createActivityAction, { success: 'Gespeichert.' })
  const [type, setType] = useState<ManualType>(defaultType)
  const [title, setTitle] = useState(defaultTitle ?? DEFAULT_TITLES[defaultType])
  const [titleTouched, setTitleTouched] = useState(Boolean(defaultTitle))
  const [body, setBody] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const when = String(form.get('occurredAt') ?? '')
    const r = await create.run({
      type,
      title,
      body: body || null,
      occurredAt: when ? new Date(when).toISOString() : undefined,
      companyId: companyId ?? null,
      contactId: (form.get('contactId') as string) || contactId || null,
      opportunityId: opportunityId ?? null,
      taskId: taskId ?? null,
    })
    if (r.ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Aktivität dokumentieren">
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Art">
            {MANUAL_ACTIVITY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => {
                  setType(t)
                  if (!titleTouched) setTitle(DEFAULT_TITLES[t])
                }}
                className={
                  type === t
                    ? 'h-8 rounded-full border border-accent/50 bg-accent-soft px-3 text-[13px] text-accent'
                    : 'h-8 rounded-full border border-line px-3 text-[13px] text-muted hover:text-fg'
                }
              >
                {de.activityType[t]}
              </button>
            ))}
          </div>
          <Field label="Titel" htmlFor="a-title" error={create.fieldErrors.title}>
            <Input
              id="a-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleTouched(true)
              }}
            />
          </Field>
          <Field label="Inhalt" htmlFor="a-body">
            <Textarea id="a-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} autoFocus placeholder="Was wurde besprochen?" />
          </Field>
          <DictateButton label="Notiz diktieren" onText={(t) => setBody((b) => appendText(b, t))} />
          {bodySlot?.((text) => setBody((b) => appendText(b, text)))}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Zeitpunkt" htmlFor="a-when">
              <Input id="a-when" name="occurredAt" type="datetime-local" defaultValue={localDateTimeValue()} />
            </Field>
            {contacts && contacts.length > 0 && (
              <Field label="Kontakt" htmlFor="a-contact">
                <Select id="a-contact" name="contactId" defaultValue={contactId ?? ''}>
                  <option value="">– ohne –</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
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

/** Short note after finishing a task (opened from the "Erledigt" toast). */
export function QuickNoteDialog(props: {
  open: boolean
  onOpenChange: (o: boolean) => void
  companyId: string | null
  contactId: string | null
  taskId?: string | null
  defaultTitle: string
}) {
  return <ActivityFormDialog {...props} defaultType="note" />
}

export function NewActivityButton({
  label = 'Aktivität dokumentieren',
  variant = 'secondary',
  ...props
}: Omit<React.ComponentProps<typeof ActivityFormDialog>, 'open' | 'onOpenChange'> & { label?: string; variant?: 'primary' | 'secondary' | 'outline' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <ActivityFormDialog open={open} onOpenChange={setOpen} {...props} />}
    </>
  )
}
