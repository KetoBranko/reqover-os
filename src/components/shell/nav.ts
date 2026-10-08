import {
  Activity,
  Building2,
  CheckSquare,
  Columns3,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { de } from '@/i18n/de'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/', label: de.nav.overview, icon: LayoutDashboard },
  { href: '/unternehmen', label: de.nav.companies, icon: Building2 },
  { href: '/kontakte', label: de.nav.contacts, icon: Users },
  { href: '/pipeline', label: de.nav.pipeline, icon: Columns3 },
  { href: '/discovery', label: de.nav.discovery, icon: MessagesSquare },
  { href: '/aufgaben', label: de.nav.tasks, icon: CheckSquare },
  { href: '/aktivitaeten', label: de.nav.activities, icon: Activity },
]

export const SECONDARY_NAV: NavItem[] = [
  { href: '/assistent', label: de.nav.assistant, icon: Sparkles },
  { href: '/einstellungen', label: de.nav.settings, icon: Settings },
]

export function isActive(pathname: string | null, href: string) {
  if (pathname == null) return false
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}
