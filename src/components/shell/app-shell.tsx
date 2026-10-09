'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Suspense, useState } from 'react'
import { LogOut, Menu } from 'lucide-react'
import * as D from '@radix-ui/react-dialog'
import { cn } from '@/lib/cn'
import { de } from '@/i18n/de'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from './nav'

interface ShellProps {
  userSlot: React.ReactNode
  bannerSlot?: React.ReactNode
  topbarSlot?: React.ReactNode
  mobileCenterSlot?: React.ReactNode
  children: React.ReactNode
}

// The active-route highlight needs the URL, which is only known at request
// time. Those parts read it behind Suspense so the shell itself stays static.
function usePath() {
  return usePathname()
}

export function AppShell({ userSlot, bannerSlot, topbarSlot, mobileCenterSlot, children }: ShellProps) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface/40 lg:flex">
        <div className="flex h-14 items-center gap-2.5 px-5">
          <div className="grid size-7 place-items-center rounded-md bg-accent-soft text-[13px] font-bold text-accent">P</div>
          <span className="text-sm font-semibold tracking-tight">ProRendo OS</span>
        </div>
        <nav aria-label="Hauptnavigation" className="flex flex-1 flex-col gap-0.5 px-3 py-2">
          <Suspense fallback={<SidebarLinks pathname={null} />}>
            <ActiveSidebarLinks />
          </Suspense>
        </nav>
        {userSlot}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="grid size-7 place-items-center rounded-md bg-accent-soft text-[13px] font-bold text-accent">P</div>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">{topbarSlot}</div>
        </header>
        {bannerSlot}
        <main id="inhalt" className="flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-7">
          {children}
        </main>
      </div>

      <Suspense fallback={<MobileNav pathname={null} centerSlot={mobileCenterSlot} userSlot={userSlot} />}>
        <ActiveMobileNav centerSlot={mobileCenterSlot} userSlot={userSlot} />
      </Suspense>
    </div>
  )
}

function ActiveSidebarLinks() {
  return <SidebarLinks pathname={usePath()} />
}

function SidebarLinks({ pathname }: { pathname: string | null }) {
  return (
    <>
      {PRIMARY_NAV.map((item) => (
        <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
      ))}
      <div className="my-3 h-px bg-line" />
      {SECONDARY_NAV.map((item) => (
        <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
      ))}
    </>
  )
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
        active ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg',
      )}
    >
      <Icon className={cn('size-4', active && 'text-accent')} aria-hidden />
      {item.label}
    </Link>
  )
}

export function DemoBanner() {
  return (
    <div role="note" className="border-b border-warning/20 bg-warning-soft px-4 py-1.5 text-center text-[12px] font-medium text-warning lg:px-8">
      {de.app.demoBanner}
    </div>
  )
}

export function UserBlock({ name, organizationName }: { name: string; organizationName: string }) {
  const router = useRouter()
  async function signOut() {
    await supabaseBrowser().auth.signOut()
    router.replace('/anmelden')
    router.refresh()
  }
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-[13px] font-semibold">
        {(name || '?').slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{name}</p>
        <p className="truncate text-[12px] text-faint">{organizationName}</p>
      </div>
      <button onClick={signOut} className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-fg" aria-label={de.nav.signOut} title={de.nav.signOut}>
        <LogOut className="size-4" />
      </button>
    </div>
  )
}

const MOBILE_TABS = [PRIMARY_NAV[0]!, PRIMARY_NAV[5]!, PRIMARY_NAV[1]!]

function ActiveMobileNav(props: { centerSlot?: React.ReactNode; userSlot: React.ReactNode }) {
  return <MobileNav pathname={usePath()} {...props} />
}

function MobileNav({ pathname, centerSlot, userSlot }: { pathname: string | null; centerSlot?: React.ReactNode; userSlot: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const more = [...PRIMARY_NAV.filter((i) => !MOBILE_TABS.includes(i)), ...SECONDARY_NAV]
  const [today, tasks, companies] = MOBILE_TABS
  return (
    <nav aria-label="Mobile Navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur pb-safe lg:hidden">
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
        <MobileTab item={{ ...today!, label: de.nav.today }} active={isActive(pathname, today!.href)} />
        <MobileTab item={tasks!} active={isActive(pathname, tasks!.href)} />
        <div className="flex justify-center">{centerSlot}</div>
        <MobileTab item={companies!} active={isActive(pathname, companies!.href)} />
        <D.Root open={open} onOpenChange={setOpen}>
          <D.Trigger className="flex flex-col items-center gap-1 text-[11px] text-muted">
            <Menu className="size-5" aria-hidden />
            {de.nav.more}
          </D.Trigger>
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-40 bg-black/60" />
            <D.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-line-strong bg-surface p-4 pb-safe">
              <D.Title className="px-2 pb-2 text-[13px] font-semibold uppercase tracking-wider text-muted">{de.nav.more}</D.Title>
              <D.Description className="sr-only">Weitere Bereiche</D.Description>
              <div className="grid gap-1">
                {more.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn('flex h-12 items-center gap-3 rounded-lg px-3 text-[15px]', isActive(pathname, item.href) ? 'bg-surface-2 text-fg' : 'text-muted')}
                  >
                    <item.icon className="size-5" aria-hidden />
                    {item.label}
                  </Link>
                ))}
              </div>
              <div className="mt-3 border-t border-line pt-1">
                {userSlot}
              </div>
            </D.Content>
          </D.Portal>
        </D.Root>
      </div>
    </nav>
  )
}

function MobileTab({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={cn('flex flex-col items-center gap-1 text-[11px]', active ? 'text-accent' : 'text-muted')}>
      <Icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  )
}
