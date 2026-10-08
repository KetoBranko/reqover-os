import { Settings } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'
import { de } from '@/i18n/de'

export default function Page() {
  return <ComingSoon title={de.nav.settings} icon={Settings} description="Hier verwaltest du künftig Organisation, Team, Pilotangebot und KI-Stufe." />
}
