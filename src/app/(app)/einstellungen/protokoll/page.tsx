import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { History } from 'lucide-react'
import { requireSession } from '@/server/auth/session'
import { AUDIT_TABLES, getAuditLog, type AuditTable } from '@/server/services/settings'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button'
import { ACTION_LABEL, TABLE_LABEL, fieldLabel, showValue } from '@/features/audit/labels'
import { formatDateTime } from '@/lib/format'
import { str } from '@/lib/params'
import { cn } from '@/lib/cn'

export const metadata: Metadata = { title: 'Änderungsprotokoll' }

export default function AuditPage({ searchParams }: PageProps<'/einstellungen/protokoll'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      {searchParams.then((p) => (
        <AuditContent table={str(p.bereich)} actor={str(p.wer)} before={str(p.vor)} />
      ))}
    </Suspense>
  )
}

function href(params: { bereich?: string; wer?: string; vor?: number | null }) {
  const q = new URLSearchParams()
  if (params.bereich) q.set('bereich', params.bereich)
  if (params.wer) q.set('wer', params.wer)
  if (params.vor) q.set('vor', String(params.vor))
  const s = q.toString()
  return `/einstellungen/protokoll${s ? `?${s}` : ''}`
}

async function AuditContent({ table, actor, before }: { table?: string; actor?: string; before?: string }) {
  const session = await requireSession()
  const t = AUDIT_TABLES.includes(table as AuditTable) ? (table as AuditTable) : undefined
  const a = actor === 'ai' || actor === 'human' ? actor : undefined
  const b = before && /^\d+$/.test(before) ? Number(before) : undefined
  const { entries, nextBefore } = await getAuditLog(session.ctx, { table: t, actor: a, before: b, limit: 50 })
  const chip = (active: boolean) => cn('rounded-full border px-3 py-1 text-[13px]', active ? 'border-accent/50 bg-accent-soft/40 text-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg')

  return (
    <>
      <nav className="mb-3 text-[13px] text-faint" aria-label="Pfad">
        <Link href="/einstellungen" className="hover:text-fg">
          Einstellungen
        </Link>
      </nav>
      <PageHeader title="Änderungsprotokoll" description="Wer hat wann was geändert, Mensch oder ReQover AI, und wer hat bestätigt." />
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Wer">
        <Link href={href({ bereich: t })} className={chip(!a)}>
          Alle
        </Link>
        <Link href={href({ bereich: t, wer: 'human' })} className={chip(a === 'human')}>
          Menschen
        </Link>
        <Link href={href({ bereich: t, wer: 'ai' })} className={chip(a === 'ai')}>
          ReQover AI
        </Link>
      </div>
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Bereich">
        <Link href={href({ wer: a })} className={cn(chip(!t), 'shrink-0')}>
          Alle Bereiche
        </Link>
        {(['companies', 'contacts', 'opportunities', 'discovery_interviews', 'evidence_scores', 'tasks', 'activities', 'insights', 'ai_action_proposals', 'organizations'] as const).map((k) => (
          <Link key={k} href={href({ bereich: k, wer: a })} className={cn(chip(t === k), 'shrink-0')}>
            {TABLE_LABEL[k]}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={History} title="Keine Einträge" description="Für diese Auswahl gibt es noch keine Änderungen." />
      ) : (
        <ol className="grid gap-2">
          {entries.map((e) => (
            <li key={e.id} className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[13px] text-faint">{formatDateTime(e.occurredAt)}</span>
                <span className="text-sm font-medium text-fg">
                  {TABLE_LABEL[e.table as AuditTable] ?? e.table} {ACTION_LABEL[e.action]}
                </span>
                {e.label && <span className="min-w-0 truncate text-sm text-muted">„{e.label}“</span>}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                {e.table === 'ai_action_proposals' ? (
                  <span>{e.action === 'insert' ? `vorgeschlagen durch ReQover AI${e.actorName ? ` auf Anfrage von ${e.actorName}` : ''}` : `entschieden durch ${e.confirmedBy ?? e.actorName ?? 'unbekannt'}`}</span>
                ) : e.actor === 'ai' ? (
                  <>
                    <Badge tone="accent">ReQover AI</Badge>
                    <span>vorgeschlagen durch ReQover AI{e.confirmedBy || e.actorName ? `, bestätigt durch ${e.confirmedBy ?? e.actorName}` : ''}</span>
                  </>
                ) : e.actor === 'system' ? (
                  <span>System</span>
                ) : (
                  <span>durch {e.actorName ?? 'unbekannt'}</span>
                )}
              </p>
              {e.changes.length > 0 && (
                <dl className="mt-2 grid gap-1 text-[13px]">
                  {e.changes.slice(0, 8).map((c) => (
                    <div key={c.field} className="grid gap-x-3 sm:grid-cols-[180px_1fr]">
                      <dt className="text-faint">{fieldLabel(c.field)}</dt>
                      <dd className="min-w-0 text-fg [overflow-wrap:anywhere]">{e.action === 'update' ? `${showValue(c.from, e.table, c.field)} → ${showValue(c.to, e.table, c.field)}` : showValue(e.action === 'delete' ? c.from : c.to, e.table, c.field)}</dd>
                    </div>
                  ))}
                  {e.changes.length > 8 && <p className="text-faint">… und {e.changes.length - 8} weitere Felder</p>}
                </dl>
              )}
            </li>
          ))}
        </ol>
      )}
      {nextBefore && (
        <div className="mt-4">
          <Link href={href({ bereich: t, wer: a, vor: nextBefore })} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Ältere Einträge
          </Link>
        </div>
      )}
    </>
  )
}
