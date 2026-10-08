import { Badge } from '@/components/ui/badge'
import { de } from '@/i18n/de'

type CompanyStatus = keyof typeof de.companyStatus

const COMPANY_TONE: Record<CompanyStatus, 'neutral' | 'accent' | 'success' | 'danger'> = {
  researched: 'neutral',
  qualified: 'accent',
  not_a_fit: 'danger',
  customer: 'success',
}

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  return <Badge tone={COMPANY_TONE[status]}>{de.companyStatus[status]}</Badge>
}

export function FitBadge({ score }: { score: number | null }) {
  if (score == null) return null
  return (
    <Badge tone={score >= 75 ? 'success' : score >= 50 ? 'accent' : 'neutral'} className="tabular">
      Fit {score}/100
    </Badge>
  )
}

export function DemoBadge() {
  return (
    <Badge tone="warning" title="Fiktiver Demo-Datensatz">
      Demo
    </Badge>
  )
}

export function PriorityDot({ priority }: { priority: keyof typeof de.taskPriority }) {
  if (priority === 'normal') return null
  return (
    <span className={priority === 'high' ? 'text-[11px] font-semibold text-danger' : 'text-[11px] text-faint'}>
      {priority === 'high' ? 'Hoch' : 'Niedrig'}
    </span>
  )
}
