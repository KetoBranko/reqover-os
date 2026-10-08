'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as DM from '@radix-ui/react-dropdown-menu'
import { CheckCircle2, MoreHorizontal, Play, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/input'
import { useAction } from '@/components/forms/use-action'
import { de } from '@/i18n/de'
import { completeDiscoveryAction, deleteDiscoveryAction, reopenDiscoveryAction, saveDiscoveryNotesAction } from './actions'
import type { Option } from './start-dialog'

export function DiscoveryHeader({
  id,
  companyId,
  companyName,
  status,
  conductedOn,
  durationMinutes,
  contactId,
  contacts,
  isDemo,
}: {
  id: string
  companyId: string
  companyName: string
  status: 'planned' | 'in_progress' | 'draft' | 'completed'
  conductedOn: string | null
  durationMinutes: number | null
  contactId: string | null
  contacts: Option[]
  isDemo: boolean
}) {
  const router = useRouter()
  const complete = useAction(completeDiscoveryAction, { success: 'Discovery abgeschlossen. Verlauf und Auswertung sind aktualisiert.' })
  const reopen = useAction(reopenDiscoveryAction, { success: 'Wieder zur Bearbeitung geöffnet.' })
  const remove = useAction(deleteDiscoveryAction)
  const saveMeta = useAction(saveDiscoveryNotesAction)
  const locked = status === 'completed'

  async function onDelete() {
    if (!window.confirm('Dieses Discovery-Gespräch mit allen Antworten und Bewertungen endgültig löschen?')) return
    const r = await remove.run({ id })
    if (r.ok) {
      toast.success('Discovery gelöscht.')
      router.replace('/discovery')
    }
  }

  return (
    <header className="mb-5">
      <nav className="mb-3 text-[13px] text-faint" aria-label="Pfad">
        <Link href="/discovery" className="hover:text-fg">
          {de.nav.discovery}
        </Link>
      </nav>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link href={`/unternehmen/${companyId}`} className="hover:text-accent">
              {companyName}
            </Link>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <Badge tone={status === 'completed' ? 'success' : status === 'in_progress' ? 'accent' : 'neutral'}>{de.discoveryStatus[status]}</Badge>
            {isDemo && <Badge tone="warning">Demo</Badge>}
            <label className="inline-flex items-center gap-1.5">
              <span className="sr-only">Gesprächsdatum</span>
              <input
                type="date"
                defaultValue={conductedOn ?? ''}
                disabled={locked}
                onChange={(e) => e.target.value && saveMeta.run({ id, data: { conductedOn: e.target.value } })}
                className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[13px] text-fg disabled:opacity-70"
              />
            </label>
            {durationMinutes != null && <span>{durationMinutes} Min.</span>}
            <Select
              aria-label="Gesprächspartner"
              defaultValue={contactId ?? ''}
              disabled={locked}
              onChange={(e) => saveMeta.run({ id, data: { contactId: e.target.value || null } })}
              className="h-7 w-auto py-0 text-[13px]"
            >
              <option value="">Ohne Gesprächspartner</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === 'in_progress' && (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/discovery/${id}/gespraech`}>
                <Play aria-hidden /> Gesprächsmodus
              </Link>
            </Button>
          )}
          {locked ? (
            <Button size="sm" onClick={() => reopen.run({ id })} loading={reopen.pending}>
              <RotateCcw aria-hidden /> Bearbeiten
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => complete.run({ id })} loading={complete.pending}>
              <CheckCircle2 aria-hidden /> Abschließen
            </Button>
          )}
          <DM.Root>
            <DM.Trigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Weitere Aktionen">
                <MoreHorizontal />
              </Button>
            </DM.Trigger>
            <DM.Portal>
              <DM.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-lg border border-line-strong bg-surface-2 p-1 shadow-xl">
                <DM.Item onSelect={onDelete} className="cursor-pointer rounded-md px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-danger-soft">
                  Discovery löschen
                </DM.Item>
              </DM.Content>
            </DM.Portal>
          </DM.Root>
        </div>
      </div>
    </header>
  )
}
