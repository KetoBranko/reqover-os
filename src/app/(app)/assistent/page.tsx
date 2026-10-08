import { Sparkles } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'
import { de } from '@/i18n/de'

export default function Page() {
  return <ComingSoon title={de.nav.assistant} icon={Sparkles} description="Der ReQover Assistent beantwortet Fragen ausschließlich auf Basis deiner Daten. Er wird nach der Übersicht und dem Briefing gebaut." />
}
