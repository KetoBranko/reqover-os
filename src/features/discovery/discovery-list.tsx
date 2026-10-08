import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/format'
import { SIGNALS, formatEvidence } from '@/domain/discovery'
import type { DiscoveryListItem } from '@/server/services/discovery'
import { de } from '@/i18n/de'

export function DiscoveryList({ items, showCompany = true }: { items: DiscoveryListItem[]; showCompany?: boolean }) {
  return (
    <ul className="grid gap-2">
      {items.map(({ interview: d, companyName, contactName, score }) => {
        const yes = SIGNALS.filter((s) => d[s.field] === 'yes').length
        const evidence = formatEvidence(score)
        return (
          <li key={d.id}>
            <Link
              href={d.status === 'in_progress' ? `/discovery/${d.id}/gespraech` : `/discovery/${d.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4 hover:border-line-strong"
            >
              <div className="min-w-48 flex-1">
                <p className="font-medium">{showCompany ? companyName : (contactName ?? 'Discovery-Gespräch')}</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {d.conductedAt ? formatDate(d.conductedAt) : 'ohne Datum'}
                  {showCompany && contactName && ` · ${contactName}`}
                  {d.summary && ` · ${d.summary.slice(0, 120)}${d.summary.length > 120 ? '…' : ''}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {d.isDemo && <Badge tone="warning">Demo</Badge>}
                <Badge tone={d.status === 'completed' ? 'success' : d.status === 'in_progress' ? 'accent' : 'neutral'}>{de.discoveryStatus[d.status]}</Badge>
                {evidence && <Badge tone="outline">Evidence {evidence}</Badge>}
                {yes > 0 && <Badge tone="outline">{yes}/6 Signale bestätigt</Badge>}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
