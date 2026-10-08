'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, MoreHorizontal, Phone } from 'lucide-react'
import * as DM from '@radix-ui/react-dropdown-menu'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CompanyStatusBadge, DemoBadge, FitBadge } from '@/components/status'
import { Badge } from '@/components/ui/badge'
import { useAction } from '@/components/forms/use-action'
import { CompanyFormDialog, type CompanyFormValues } from './company-form'
import { deleteCompanyAction } from './actions'

export function CompanyHeader({ company, isDemo, actions }: { company: CompanyFormValues & { id: string; name: string; status: NonNullable<CompanyFormValues['status']> }; isDemo: boolean; actions?: React.ReactNode }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const remove = useAction(deleteCompanyAction)

  async function onDelete() {
    if (!window.confirm(`„${company.name}“ mit allen Kontakten, Aufgaben und Aktivitäten endgültig löschen?`)) return
    const r = await remove.run({ id: company.id })
    if (r.ok) {
      toast.success('Unternehmen gelöscht.')
      router.replace('/unternehmen')
    }
  }

  return (
    <header className="mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <CompanyStatusBadge status={company.status} />
            {company.industry && <Badge tone="outline">{company.industry}</Badge>}
            <FitBadge score={company.fitScore ?? null} />
            {isDemo && <DemoBadge />}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
            {company.website && (
              <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                {company.website.replace(/^https?:\/\//, '')}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
            {company.phone && (
              <a href={`tel:${company.phone}`} className="inline-flex items-center gap-1 hover:text-accent">
                <Phone className="size-3" aria-hidden />
                {company.phone}
              </a>
            )}
            {company.city && <span>{company.city}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions}
          <Button size="sm" onClick={() => setEditing(true)}>
            Bearbeiten
          </Button>
          <DM.Root>
            <DM.Trigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Weitere Aktionen">
                <MoreHorizontal />
              </Button>
            </DM.Trigger>
            <DM.Portal>
              <DM.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-lg border border-line-strong bg-surface-2 p-1 shadow-xl">
                <DM.Item onSelect={onDelete} className="cursor-pointer rounded-md px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-danger-soft">
                  Unternehmen löschen
                </DM.Item>
              </DM.Content>
            </DM.Portal>
          </DM.Root>
        </div>
      </div>
      {editing && <CompanyFormDialog open={editing} onOpenChange={setEditing} initial={company} />}
    </header>
  )
}
