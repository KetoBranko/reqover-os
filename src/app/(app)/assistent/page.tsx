import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'
import { requireSession } from '@/server/auth/session'
import { aiStatus } from '@/server/ai/provider'
import { getConversation } from '@/server/services/assistant'
import { str } from '@/lib/params'
import { PageHeader } from '@/components/page-header'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { AssistantChat, type ChatItem } from '@/features/assistant/chat'
import { de } from '@/i18n/de'

export const metadata: Metadata = { title: de.nav.assistant }

export default function AssistantPage({ searchParams }: PageProps<'/assistent'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      {searchParams.then((p) => (
        <AssistantContent frage={str(p.frage)} />
      ))}
    </Suspense>
  )
}

async function AssistantContent({ frage }: { frage?: string }) {
  const session = await requireSession()
  const ai = aiStatus(session.organization.settings.aiLevel)
  if (!ai.available) {
    return (
      <>
        <PageHeader title={de.nav.assistant} />
        <EmptyState icon={Sparkles} title="Assistent nicht verfügbar" description={ai.reason} />
      </>
    )
  }
  const conversation = await getConversation(session.ctx)
  const items: ChatItem[] = (conversation?.entries ?? []).map(({ id, role, text, sources, proposal }) => ({ id, role, text, sources, proposal }))
  return (
    <>
      <PageHeader title={de.nav.assistant} description={ai.provider === 'fake' ? 'Testmodus, kein echtes Modell' : undefined} />
      <AssistantChat conversationId={conversation?.id ?? null} items={items} initialQuestion={frage?.trim() ? frage.trim().slice(0, 4000) : null} />
    </>
  )
}
