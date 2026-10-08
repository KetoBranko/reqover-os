import { Suspense } from 'react'
import { requireSession } from '@/server/auth/session'
import { formatLongDate } from '@/lib/format'
import { Skeleton } from '@/components/ui/states'

export default function OverviewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-16 w-72" />}>
      <Greeting />
    </Suspense>
  )
}

async function Greeting() {
  const session = await requireSession()
  return (
    <div>
      <p className="text-sm text-muted">{formatLongDate(new Date())}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hallo, {session.firstName ?? session.displayName}.</h1>
    </div>
  )
}
