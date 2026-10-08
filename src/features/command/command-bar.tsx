'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import * as D from '@radix-ui/react-dialog'
import { Building2, CheckSquare, Columns3, MessagesSquare, CornerDownLeft, Search, Sparkles, User, UserPlus, Plus, type LucideIcon } from 'lucide-react'
import { PRIMARY_NAV, SECONDARY_NAV } from '@/components/shell/nav'
import { formatDay } from '@/lib/format'
import { de } from '@/i18n/de'
import { searchAction } from './actions'
import type { SearchHit } from '@/server/services/search'

const OPEN_EVENT = 'reqover:command-open'

/** Round launcher for the mobile bottom bar; opens the same command bar. */
export function CommandLauncher() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      aria-label="Neu anlegen oder suchen"
      className="-mt-5 grid size-12 place-items-center rounded-full bg-accent text-accent-contrast shadow-lg shadow-black/40 active:scale-95"
    >
      <Plus className="size-6" aria-hidden />
    </button>
  )
}

const QUICK_ACTIONS: { label: string; href: string; icon: LucideIcon; keywords: string[] }[] = [
  { label: 'Neues Unternehmen anlegen', href: '/unternehmen?neu=', icon: Building2, keywords: ['firma', 'anlegen', 'neu'] },
  { label: 'Neuen Kontakt anlegen', href: '/kontakte?neu=', icon: UserPlus, keywords: ['person', 'ansprechpartner', 'neu'] },
  { label: 'Discovery starten', href: '/discovery?neu=', icon: MessagesSquare, keywords: ['gespräch', 'interview', 'discovery', 'starten'] },
  { label: 'Neue Chance anlegen', href: '/pipeline?neu=', icon: Columns3, keywords: ['opportunity', 'deal', 'pipeline', 'neu'] },
  { label: 'Neue Aufgabe anlegen', href: '/aufgaben?neu=', icon: Plus, keywords: ['todo', 'wiedervorlage', 'erinnerung', 'neu'] },
]

const HIT_ICON: Record<SearchHit['kind'], LucideIcon> = { company: Building2, contact: User, task: CheckSquare }
const HIT_GROUP: Record<SearchHit['kind'], string> = { company: de.nav.companies, contact: de.nav.contacts, task: 'Offene Aufgaben' }

/** ⌘K / Ctrl+K: navigation, quick actions, global search, and free text handed to the assistant. */
export function CommandBar() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, startSearch] = useTransition()
  const latest = useRef('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  function onQueryChange(value: string) {
    setQuery(value)
    const q = value.trim()
    latest.current = q
    clearTimeout(timer.current)
    if (q.length < 2) return
    timer.current = setTimeout(() => {
      startSearch(async () => {
        const r = await searchAction({ q })
        if (latest.current === q) setHits(r.ok ? r.data : [])
      })
    }, 180)
  }

  function go(href: string) {
    setOpen(false)
    setQuery('')
    router.push(withNonce(href))
  }

  const visibleHits = query.trim().length >= 2 ? hits : []
  const groups = (['company', 'contact', 'task'] as const).map((kind) => ({ kind, items: visibleHits.filter((h) => h.kind === kind) })).filter((g) => g.items.length)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm text-faint hover:border-line-strong hover:text-muted"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">{de.nav.commandBar}</span>
        <kbd className="hidden rounded border border-line px-1.5 text-[11px] text-faint sm:inline">⌘K</kbd>
      </button>

      <D.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery('') }}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
          <D.Content className="fixed inset-x-0 top-0 z-50 mx-auto w-full max-w-xl px-3 pt-[max(env(safe-area-inset-top),12px)] sm:top-[12vh] sm:pt-0">
            <D.Title className="sr-only">{de.nav.commandBar}</D.Title>
            <D.Description className="sr-only">Navigieren, suchen oder einen Eintrag anlegen.</D.Description>
            <Command shouldFilter={true} loop className="overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl">
              <div className="flex items-center gap-2 border-b border-line px-4">
                <Search className="size-4 text-faint" aria-hidden />
                <Command.Input
                  value={query}
                  onValueChange={onQueryChange}
                  placeholder="Suchen, Aktion wählen oder ReQover fragen …"
                  className="h-12 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-faint"
                />
                {searching && <span className="text-[12px] text-faint">{de.common.loading}</span>}
              </div>
              <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                {/* From three characters the assistant entry is always offered, so there is no empty state. */}
                {query.trim().length < 3 && (
                  <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
                    {query.trim().length < 2 ? 'Tippe mindestens zwei Zeichen.' : searching ? de.common.loading : 'Keine Treffer.'}
                  </Command.Empty>
                )}

                {groups.map((g) => (
                  <Command.Group key={g.kind} heading={HIT_GROUP[g.kind]} className={GROUP}>
                    {g.items.map((h) => {
                      const Icon = HIT_ICON[h.kind]
                      return (
                        <Command.Item key={`${h.kind}-${h.id}`} value={`${h.kind}-${h.id} ${h.title}`} keywords={[query]} onSelect={() => go(h.href)} className={ITEM}>
                          <Icon className="size-4 text-faint" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{h.title}</span>
                          {h.subtitle && (
                            <span className="truncate text-[12px] text-faint">{h.kind === 'task' ? `fällig ${formatDay(h.subtitle)}` : h.subtitle}</span>
                          )}
                        </Command.Item>
                      )
                    })}
                  </Command.Group>
                ))}

                <Command.Group heading="Schnellaktionen" className={GROUP}>
                  {QUICK_ACTIONS.map((a) => (
                    <Command.Item key={a.href} value={a.label} keywords={a.keywords} onSelect={() => go(a.href)} className={ITEM}>
                      <a.icon className="size-4 text-faint" aria-hidden />
                      <span className="flex-1">{a.label}</span>
                      <CornerDownLeft className="size-3.5 text-faint opacity-0 group-data-[selected=true]:opacity-100" aria-hidden />
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Gehe zu" className={GROUP}>
                  {[...PRIMARY_NAV, ...SECONDARY_NAV].map((n) => (
                    <Command.Item key={n.href} value={`Gehe zu ${n.label}`} onSelect={() => go(n.href)} className={ITEM}>
                      <n.icon className="size-4 text-faint" aria-hidden />
                      <span className="flex-1">{n.label}</span>
                    </Command.Item>
                  ))}
                </Command.Group>

                {query.trim().length >= 3 && (
                  <Command.Group heading="Assistent" className={GROUP} forceMount>
                    <Command.Item value="ReQover fragen" forceMount onSelect={() => go(`/assistent?frage=${encodeURIComponent(query.trim())}`)} className={ITEM}>
                      <Sparkles className="size-4 text-accent" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">ReQover fragen: „{query.trim()}“</span>
                    </Command.Item>
                  </Command.Group>
                )}
              </Command.List>
              <div className="hidden items-center justify-between border-t border-line px-4 py-2 text-[11px] text-faint sm:flex">
                <span>↑↓ auswählen · ↵ öffnen · Esc schließen</span>
                <span>Freitext stellt eine Frage an ReQover</span>
              </div>
            </Command>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  )
}

/** A fresh ?neu= value remounts the target page's dialog even when it is already open in the background. */
function withNonce(href: string) {
  return href.endsWith('?neu=') ? `${href}${Date.now().toString(36)}` : href
}

const GROUP = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint'
const ITEM = 'group flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-muted data-[selected=true]:bg-surface-2 data-[selected=true]:text-fg'
