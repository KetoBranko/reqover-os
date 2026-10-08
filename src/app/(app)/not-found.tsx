import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { EmptyState } from '@/components/ui/states'
import { Button } from '@/components/ui/button'
import { de } from '@/i18n/de'

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Nicht gefunden"
      description={de.errors.notFound}
      actions={
        <Button asChild variant="secondary">
          <Link href="/">Zur Übersicht</Link>
        </Button>
      }
    />
  )
}
