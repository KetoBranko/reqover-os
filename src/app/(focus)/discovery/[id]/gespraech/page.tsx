import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { requireSession } from '@/server/auth/session'
import { getDiscovery } from '@/server/services/discovery'
import { Skeleton } from '@/components/ui/states'
import { ConversationMode } from '@/features/discovery/conversation'
import { VoiceConfig } from '@/features/voice/voice-config'
import { voiceMode } from '@/server/stt/provider'

export const metadata: Metadata = { title: 'Gesprächsmodus' }

export default function ConversationPage({ params }: PageProps<'/discovery/[id]/gespraech'>) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96" />}>
      {params.then(({ id }) => (
        <Conversation id={id} />
      ))}
    </Suspense>
  )
}

async function Conversation({ id }: { id: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const session = await requireSession()
  const d = await getDiscovery(session.ctx, id)
  if (!d) notFound()
  if (d.interview.status !== 'in_progress' || !d.interview.startedAt) redirect(`/discovery/${id}`)
  return (
    <>
      <VoiceConfig value={voiceMode()} />
      <ConversationMode
        discoveryId={id}
        companyId={d.interview.companyId}
        companyName={d.companyName}
        contactName={d.contactName}
        startedAt={d.interview.startedAt.toISOString()}
        questions={d.questions}
        answers={d.answers}
        rawNotes={d.interview.rawNotes}
        coreAnswer={d.interview.coreQuestionAnswer}
      />
    </>
  )
}
