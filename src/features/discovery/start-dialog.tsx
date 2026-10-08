'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { useAction } from '@/components/forms/use-action'
import { berlinDay } from '@/lib/format'
import { de } from '@/i18n/de'
import { startDiscoveryAction } from './actions'

export interface Option {
  id: string
  name: string
  companyId?: string
}

type Mode = 'live' | 'document'

const COPY: Record<Mode, { title: string; button: string; submit: string; description: string }> = {
  live: {
    title: 'Discovery starten',
    button: 'Discovery starten',
    submit: 'Gesprächsmodus öffnen',
    description: 'Reduzierte Ansicht mit Timer, Kernfragen und Notizen. Es wird nichts aufgezeichnet.',
  },
  document: {
    title: 'Gespräch dokumentieren',
    button: 'Gespräch dokumentieren',
    submit: 'Anlegen',
    description: 'Für ein Gespräch, das bereits stattgefunden hat.',
  },
}

export function StartDiscoveryButton({
  mode,
  companies,
  contacts,
  companyId: fixedCompanyId,
  variant = mode === 'live' ? 'primary' : 'secondary',
  label,
  autoOpen = false,
}: {
  mode: Mode
  companies?: Option[]
  contacts: Option[]
  companyId?: string
  variant?: 'primary' | 'secondary'
  label?: string
  autoOpen?: boolean
}) {
  const [open, setOpen] = useState(autoOpen)
  return (
    <>
      <Button variant={variant} size={variant === 'primary' ? 'md' : 'sm'} onClick={() => setOpen(true)}>
        {label ?? COPY[mode].button}
      </Button>
      {open && <StartDialog mode={mode} companies={companies} contacts={contacts} fixedCompanyId={fixedCompanyId} onClose={() => setOpen(false)} />}
    </>
  )
}

function StartDialog({ mode, companies, contacts, fixedCompanyId, onClose }: { mode: Mode; companies?: Option[]; contacts: Option[]; fixedCompanyId?: string; onClose: () => void }) {
  const router = useRouter()
  const start = useAction(startDiscoveryAction)
  const [companyId, setCompanyId] = useState(fixedCompanyId ?? '')
  const visibleContacts = contacts.filter((c) => c.companyId === companyId)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const r = await start.run({
      companyId,
      contactId: (f.get('contactId') as string) || null,
      mode,
      conductedOn: mode === 'document' ? (f.get('conductedOn') as string) || null : null,
    })
    if (r.ok) router.push(mode === 'live' ? `/discovery/${r.data.id}/gespraech` : `/discovery/${r.data.id}`)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={COPY[mode].title} description={COPY[mode].description}>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {!fixedCompanyId && companies && (
            <Field label="Unternehmen" htmlFor="d-company" error={start.fieldErrors.companyId}>
              <Select id="d-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)} autoFocus aria-invalid={Boolean(start.fieldErrors.companyId)}>
                <option value="">Bitte wählen …</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Gesprächspartner" htmlFor="d-contact" hint={companyId && !visibleContacts.length ? 'Für dieses Unternehmen ist noch kein Kontakt angelegt.' : undefined}>
            <Select id="d-contact" name="contactId" defaultValue="" disabled={!visibleContacts.length}>
              <option value="">– ohne –</option>
              {visibleContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          {mode === 'document' && (
            <Field label="Gesprächsdatum" htmlFor="d-date">
              <Input id="d-date" name="conductedOn" type="date" defaultValue={berlinDay()} max={berlinDay()} />
            </Field>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              {de.common.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={start.pending} disabled={!companyId}>
              {COPY[mode].submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
