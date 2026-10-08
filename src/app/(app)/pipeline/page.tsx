import { Columns3 } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'
import { de } from '@/i18n/de'

export default function Page() {
  return <ComingSoon title={de.nav.pipeline} icon={Columns3} description="Die Vertriebspipeline mit neun Phasen von „Kontakt aufnehmen“ bis „Gewonnen“ oder „Verloren“ wird als nächstes gebaut." />
}
