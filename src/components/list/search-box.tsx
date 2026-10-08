'use client'

import { Search } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

/** Search field synced to ?q= (debounced, keeps other params). */
export function SearchBox({ placeholder, className }: { placeholder: string; className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = useState(params.get('q') ?? '')

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (value.trim()) next.set('q', value.trim())
      else next.delete('q')
      next.delete('seite')
      if (next.toString() !== params.toString()) router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    }, 250)
    return () => clearTimeout(handle)
  }, [value, params, pathname, router])

  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-line bg-surface-2 pl-9 pr-3 text-sm placeholder:text-faint hover:border-line-strong focus-visible:border-accent focus-visible:outline-none"
      />
    </label>
  )
}

export function FilterChips({ param, options, allLabel = 'Alle' }: { param: string; options: { value: string; label: string }[]; allLabel?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = params.get(param) ?? ''
  function set(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(param, value)
    else next.delete(param)
    next.delete('seite')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="group">
      {[{ value: '', label: allLabel }, ...options].map((o) => (
        <button
          key={o.value}
          onClick={() => set(o.value)}
          aria-pressed={current === o.value}
          className={cn(
            'h-8 shrink-0 rounded-full border px-3 text-[13px] transition-colors',
            current === o.value ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
