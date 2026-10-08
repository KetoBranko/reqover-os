import { HIGH_PRIORITY, explain, type PriorityItem } from '@/domain/briefing'
import { cn } from '@/lib/cn'

/** Native disclosure, so "Warum?" works without JavaScript and with the keyboard. */
export function WhyDetails({ item, className }: { item: PriorityItem; className?: string }) {
  return (
    <details className={cn('group text-sm', className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-[13px] font-medium text-accent hover:underline [&::-webkit-details-marker]:hidden">
        Warum?
      </summary>
      <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3">
        <p className="text-fg">{explain(item)}</p>
        <ul className="mt-2 space-y-1 text-[13px] text-muted" aria-label="Gewichtung">
          {item.reasons.map((r) => (
            <li key={`${r.code}-${r.clause}`} className="flex justify-between gap-3">
              <span>{r.label}</span>
              <span className="tabular text-faint">+{r.weight}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-line pt-2 text-[12px] text-faint">
          Summe {item.score} Punkte · ab {HIGH_PRIORITY} Punkten hohe Priorität. Berechnet aus Aufgaben, Wiedervorlagen, Pipeline und Discovery-Daten.
        </p>
      </div>
    </details>
  )
}
