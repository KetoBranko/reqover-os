import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { BriefingLine, PriorityItem } from '@/domain/briefing'
import { WhyDetails } from './why-details'
import { cn } from '@/lib/cn'

/** "REQOVER BRIEFING": short, data-derived sentences. Each line links to its source. */
export function BriefingCard({ lines, top }: { lines: BriefingLine[]; top: PriorityItem | null }) {
  return (
    <section aria-labelledby="briefing-title" className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="briefing-title" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
        ReQover Briefing
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed">
        {lines.map((line, i) => (
          <div key={`${line.kind}-${i}`} className={cn(line.kind === 'headline' ? 'text-lg font-medium text-fg' : 'text-muted', line.kind === 'recommendation' && 'text-fg')}>
            <p>
              {line.text}
              {line.href && line.kind !== 'headline' && (
                <Link href={line.href} className="ml-1.5 inline-flex items-center gap-0.5 whitespace-nowrap text-[13px] text-accent hover:underline">
                  {LINK_LABEL[line.kind]}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </p>
            {line.kind === 'recommendation' && top && <WhyDetails item={top} className="mt-2" />}
          </div>
        ))}
      </div>
    </section>
  )
}

const LINK_LABEL: Record<BriefingLine['kind'], string> = {
  headline: '',
  load: 'Aufgaben',
  recommendation: 'Öffnen',
  gap: 'Öffnen',
  validation: 'Validierung',
  changes: 'Verlauf',
}
