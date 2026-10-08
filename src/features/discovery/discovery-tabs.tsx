import Link from 'next/link'
import { cn } from '@/lib/cn'

const TABS = [
  { key: 'list', href: '/discovery', label: 'Gespräche' },
  { key: 'validation', href: '/discovery/validierung', label: 'Validierung' },
] as const

/** Link-based sub navigation between the discovery list and the validation dashboard. */
export function DiscoveryTabs({ active }: { active: (typeof TABS)[number]['key'] }) {
  return (
    <nav aria-label="Discovery-Bereiche" className="mb-5 flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm text-muted transition-colors hover:text-fg',
            t.key === active && 'border-accent text-fg',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
