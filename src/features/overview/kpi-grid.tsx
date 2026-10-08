import Link from 'next/link'
import type { Kpis } from '@/domain/briefing'
import { formatMoney, formatNumber } from '@/lib/format'
import { cn } from '@/lib/cn'

interface Tile {
  label: string
  value: string
  hint?: string
  href: string
  tone?: 'danger'
}

function tiles(k: Kpis): Tile[] {
  return [
    { label: 'Zielunternehmen', value: formatNumber(k.targetCompanies), hint: `${formatNumber(k.qualifiedCompanies)} qualifiziert`, href: '/unternehmen' },
    {
      label: 'Discovery-Gespräche',
      value: formatNumber(k.discoveriesCompleted),
      hint: k.discoveriesOpen ? `abgeschlossen · ${k.discoveriesOpen} offen` : 'abgeschlossen',
      href: '/discovery',
    },
    { label: 'Bestätigter Bedarf', value: formatNumber(k.needConfirmed), hint: 'Unternehmen laut Discovery', href: '/discovery/validierung' },
    { label: 'Pilot-Chancen', value: formatNumber(k.pilotOpportunities), href: '/pipeline' },
    { label: 'Offene Angebote', value: formatNumber(k.openProposals), hint: k.openProposalsValueCents ? formatMoney(k.openProposalsValueCents) : undefined, href: '/pipeline' },
    {
      label: 'Pipeline',
      value: k.pipelineValueCents ? formatMoney(k.pipelineValueCents) : formatNumber(0),
      hint: `${formatNumber(k.pipelineCount)} offene ${k.pipelineCount === 1 ? 'Chance' : 'Chancen'}`,
      href: '/pipeline',
    },
    { label: 'Gewonnene Piloten', value: formatNumber(k.wonPilots), hint: k.wonWithoutOrder ? `${k.wonWithoutOrder} ohne dokumentierten Auftrag` : undefined, href: '/pipeline' },
    {
      label: 'Fällige Aufgaben',
      value: formatNumber(k.tasksDue),
      hint: k.tasksOverdue ? `davon ${k.tasksOverdue} überfällig` : undefined,
      href: '/aufgaben',
      tone: k.tasksOverdue ? 'danger' : undefined,
    },
  ]
}

export function KpiGrid({ kpis }: { kpis: Kpis }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2" aria-label="Kennzahlen">
      {tiles(kpis).map((t) => (
        <li key={t.label}>
          <Link href={t.href} className="block h-full rounded-xl border border-line bg-surface p-3.5 transition-colors hover:border-line-strong hover:bg-surface-2">
            <span className="block text-[12px] text-muted">{t.label}</span>
            <span className={cn('tabular mt-1 block text-xl font-semibold text-fg', t.tone === 'danger' && 'text-danger')}>{t.value}</span>
            {t.hint && <span className={cn('mt-0.5 block text-[12px] text-faint', t.tone === 'danger' && 'text-danger')}>{t.hint}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
