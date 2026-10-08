import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { PageHeader } from '@/components/page-header'
import { de } from '@/i18n/de'
import type { LucideIcon } from 'lucide-react'

/** Honest placeholder for an area that is planned but not built yet. No fake controls. */
export function ComingSoon({ title, icon, description }: { title: string; icon: LucideIcon; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={icon} title={`${title} · ${de.common.comingSoon}`} description={description} actions={<Badge>{de.common.comingSoon}</Badge>} />
    </>
  )
}
