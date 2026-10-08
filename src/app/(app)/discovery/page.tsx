import { MessagesSquare } from 'lucide-react'
import { ComingSoon } from '@/components/coming-soon'
import { de } from '@/i18n/de'

export default function Page() {
  return <ComingSoon title={de.nav.discovery} icon={MessagesSquare} description="Strukturierte Discovery-Gespräche mit Fragenkatalog, Signalen und Evidence Score folgen in einer der nächsten Ausbaustufen." />
}
