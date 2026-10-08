import Link from 'next/link'
import { ArrowRightLeft, Bot, CheckCircle2, FileText, Mail, MessagesSquare, Phone, Sparkles, Target, Users, type LucideIcon } from 'lucide-react'
import { de } from '@/i18n/de'
import { formatDateTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'

type ActivityType = keyof typeof de.activityType

const ICONS: Record<ActivityType, LucideIcon> = {
  call: Phone,
  meeting: Users,
  email: Mail,
  note: FileText,
  discovery: MessagesSquare,
  task: CheckCircle2,
  stage_change: ArrowRightLeft,
  opportunity: Target,
  ai_action: Sparkles,
  system: Bot,
}

export interface TimelineEntry {
  id: string
  type: ActivityType
  title: string
  body: string | null
  occurredAt: Date
  actor: 'human' | 'ai' | 'system'
  companyId?: string | null
  companyName?: string | null
  contactId?: string | null
  contactName?: string | null
}

export function Timeline({ entries, showContext = false }: { entries: TimelineEntry[]; showContext?: boolean }) {
  return (
    <ol className="relative">
      {entries.map((e, i) => {
        const Icon = ICONS[e.type]
        return (
          <li key={e.id} className="relative flex gap-3 pb-5">
            {i < entries.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-line" />}
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-muted">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-fg">{e.title}</span>
                {!e.title.startsWith(de.activityType[e.type]) && <span className="text-[12px] text-faint">{de.activityType[e.type]}</span>}
                {e.actor === 'ai' && <Badge tone="accent">AI</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-faint">
                <time dateTime={e.occurredAt.toISOString()} className="tabular">
                  {formatDateTime(e.occurredAt)}
                </time>
                {showContext && e.companyId && e.companyName && (
                  <Link href={`/unternehmen/${e.companyId}`} className="hover:text-accent">
                    {e.companyName}
                  </Link>
                )}
                {showContext && e.contactId && e.contactName && (
                  <Link href={`/kontakte/${e.contactId}`} className="hover:text-accent">
                    {e.contactName}
                  </Link>
                )}
              </div>
              {e.body && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{e.body}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
