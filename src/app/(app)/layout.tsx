import { Suspense } from 'react'
import { requireSession } from '@/server/auth/session'
import { hasDemoData } from '@/server/services/demo'
import { AppShell, DemoBanner, UserBlock } from '@/components/shell/app-shell'

// The shell (navigation) is static and prerendered; everything user-specific
// streams in behind Suspense boundaries.
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <AppShell
      userSlot={
        <Suspense fallback={<div className="h-14 border-t border-line" />}>
          <SessionUserBlock />
        </Suspense>
      }
      bannerSlot={
        <Suspense fallback={null}>
          <SessionDemoBanner />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  )
}

async function SessionUserBlock() {
  const session = await requireSession()
  return <UserBlock name={session.displayName || session.email || ''} organizationName={session.organization.name} />
}

async function SessionDemoBanner() {
  const session = await requireSession()
  return (await hasDemoData(session.ctx)) ? <DemoBanner /> : null
}
