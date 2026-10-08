import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { EVIDENCE_MAX } from '@/domain/discovery'
import type { PriorityItem } from '@/domain/briefing'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { WhyDetails } from './why-details'

const VISIBLE = 6

export function PriorityList({ items }: { items: PriorityItem[] }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Für heute ist nichts fällig"
        description="Keine fälligen Aufgaben oder Wiedervorlagen und keine Chance ohne nächsten Schritt."
        actions={
          <Link href="/aufgaben?neu=1" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Aufgabe anlegen
          </Link>
        }
      />
    )
  }
  const rest = items.slice(VISIBLE)
  return (
    <div>
      <ol className="grid gap-3">
        {items.slice(0, VISIBLE).map((item, i) => (
          <PriorityRow key={item.key} item={item} rank={i + 1} />
        ))}
      </ol>
      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] text-muted hover:text-fg">{rest.length === 1 ? 'Ein weiterer Punkt' : `${rest.length} weitere Punkte`}</summary>
          <ol className="mt-3 grid gap-3">
            {rest.map((item, i) => (
              <PriorityRow key={item.key} item={item} rank={VISIBLE + i + 1} />
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}

function PriorityRow({ item, rank }: { item: PriorityItem; rank: number }) {
  const [first, ...more] = item.actions
  const chips = item.reasons.filter((r) => r.code !== 'strong_evidence').slice(0, 3)
  return (
    <li className="rounded-xl border border-line bg-surface p-4" aria-label={`${rank}. ${item.title}`}>
      <div className="flex items-start gap-3">
        <span className="tabular mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-surface-3 text-[12px] font-semibold text-muted" aria-hidden>
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={item.href} className="truncate text-[15px] font-semibold text-fg hover:text-accent">
              {item.title}
            </Link>
            {item.high && <Badge tone="warning">Hohe Priorität</Badge>}
            {item.evidencePoints != null && (
              <span className="tabular text-[12px] text-muted">
                Evidence {item.evidencePoints}/{EVIDENCE_MAX}
              </span>
            )}
          </div>
          {first && <p className="mt-1 text-sm text-fg">{first}</p>}
          {more.length > 0 && <p className="mt-0.5 text-[13px] text-faint">außerdem: {more.slice(0, 2).join(' · ')}{more.length > 2 ? ` · +${more.length - 2}` : ''}</p>}
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Gründe">
            {chips.map((r) => (
              <li key={`${r.code}-${r.clause}`} className={r.code.endsWith('overdue') ? 'rounded-md bg-danger-soft px-2 py-0.5 text-[12px] text-danger' : 'rounded-md bg-surface-3 px-2 py-0.5 text-[12px] text-muted'}>
                {r.label}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {item.prepareHref && (
              <Link href={item.prepareHref} className={buttonVariants({ variant: 'primary', size: 'sm' })} aria-label={`${item.title} vorbereiten`}>
                Vorbereiten
              </Link>
            )}
            <Link href={item.href} className={buttonVariants({ variant: 'secondary', size: 'sm' })} aria-label={`${item.title} öffnen`}>
              Öffnen
            </Link>
            <WhyDetails item={item} className="basis-full" />
          </div>
        </div>
      </div>
    </li>
  )
}
