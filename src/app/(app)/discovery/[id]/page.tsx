import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { requireSession } from '@/server/auth/session'
import { getDiscovery } from '@/server/services/discovery'
import { latestPendingProposal } from '@/server/services/proposals'
import { aiStatus } from '@/server/ai/provider'
import { AnalyzeCard } from '@/features/ai/analyze-card'
import { Skeleton } from '@/components/ui/states'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DiscoveryHeader } from '@/features/discovery/workspace-header'
import { ListField, NoteField, QuestionField } from '@/features/discovery/fields'
import { EvidenceScorePanel, SignalsPanel } from '@/features/discovery/evidence-panel'
import { EvidenceVsInterpretation } from '@/features/discovery/interpretation-panel'
import { CORE_QUESTION, SIGNALS, type SignalKey, type SignalValue } from '@/domain/discovery'
import { berlinDay, formatMoney } from '@/lib/format'
import { parsePilotOffer } from '@/domain/settings'
import { de } from '@/i18n/de'

export const metadata: Metadata = { title: 'Discovery' }

const SECTIONS = ['company', 'sales_process', 'problem', 'reaction', 'willingness_to_pay', 'buying_process'] as const

export default function DiscoveryPage({ params }: PageProps<'/discovery/[id]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      {params.then(({ id }) => (
        <Workspace id={id} />
      ))}
    </Suspense>
  )
}

async function Workspace({ id }: { id: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const session = await requireSession()
  const [d, pending] = await Promise.all([getDiscovery(session.ctx, id), latestPendingProposal(session.ctx, id)])
  if (!d) notFound()
  const ai = aiStatus(session.organization.settings.aiLevel)
  const i = d.interview
  const locked = i.status === 'completed'
  const signals = Object.fromEntries(SIGNALS.map((s) => [s.key, i[s.field]])) as Record<SignalKey, SignalValue>
  const offer = parsePilotOffer(i.pilotOfferSnapshot) ?? session.organization.settings.pilotOffer
  const answered = d.questions.filter((q) => d.answers[q.key]).length

  return (
    <>
      <DiscoveryHeader
        id={id}
        companyId={i.companyId}
        companyName={d.companyName}
        status={i.status}
        conductedOn={i.conductedAt ? berlinDay(i.conductedAt) : null}
        durationMinutes={i.durationSeconds != null ? Math.max(1, Math.round(i.durationSeconds / 60)) : null}
        contactId={i.contactId}
        contacts={d.contacts}
        isDemo={i.isDemo}
      />
      {locked && (
        <p className="mb-4 rounded-lg border border-line bg-surface px-4 py-2.5 text-[13px] text-muted">
          Abgeschlossen. Zum Ändern „Bearbeiten“ wählen; die Auswertung aktualisiert sich danach erneut.
        </p>
      )}
      {!locked && (
        <div className="mb-4">
          <AnalyzeCard discoveryId={id} unavailableReason={ai.available ? null : ai.reason} pendingProposalId={pending?.id ?? null} />
        </div>
      )}
      <Tabs defaultValue="conversation">
        <TabsList aria-label="Bereiche">
          <TabsTrigger value="conversation">Gespräch</TabsTrigger>
          <TabsTrigger value="questions">
            Fragen · {answered}/{d.questions.length}
          </TabsTrigger>
          <TabsTrigger value="score">Evidence Score · {d.total.points}/20</TabsTrigger>
          <TabsTrigger value="evidence">Evidenz vs. Interpretation</TabsTrigger>
        </TabsList>

        <TabsContent value="conversation" className="mt-5 grid gap-4 lg:grid-cols-2">
          <Card className="grid content-start gap-4 p-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-accent">{de.discoverySection.core_question}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{CORE_QUESTION}</p>
            </div>
            <NoteField discoveryId={id} field="coreQuestionAnswer" label="Antwort (möglichst wörtlich)" initial={i.coreQuestionAnswer} rows={3} disabled={locked} />
            <NoteField discoveryId={id} field="summary" label="Zusammenfassung" initial={i.summary} rows={4} disabled={locked} placeholder="Was ist das Wichtigste aus dem Gespräch?" />
            <NoteField discoveryId={id} field="mainPain" label="Hauptschmerz" initial={i.mainPain} rows={2} disabled={locked} />
            <NoteField discoveryId={id} field="recoveryUseCase" label="Recovery Use Case" initial={i.recoveryUseCase} rows={2} disabled={locked} />
          </Card>
          <div className="grid content-start gap-4">
            <Card className="p-4">
              <NoteField discoveryId={id} field="rawNotes" label="Gesprächsnotizen" initial={i.rawNotes} rows={10} disabled={locked} />
            </Card>
            <Card className="grid gap-4 p-4">
              <ListField discoveryId={id} field="objections" label="Einwände" initial={i.objections} placeholder="Einwand eingeben, Enter" disabled={locked} />
              <ListField discoveryId={id} field="externalizationConcerns" label="Bedenken gegen externe Bearbeitung" initial={i.externalizationConcerns} placeholder="z. B. Datenschutz, Kundenbeziehung" disabled={locked} />
              <ListField discoveryId={id} field="desiredKpis" label="Gewünschte Kennzahlen" initial={i.desiredKpis} placeholder="z. B. reaktivierte Angebote" disabled={locked} />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="questions" className="mt-5 grid gap-4">
          {SECTIONS.map((section) => {
            const qs = d.questions.filter((q) => q.section === section)
            if (!qs.length) return null
            return (
              <Card key={section} className="px-4 pt-3" aria-label={de.discoverySection[section]}>
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted">{de.discoverySection[section]}</h2>
                {section === 'willingness_to_pay' && (
                  <p className="mt-1 text-[13px] text-muted">
                    Pilot-Hypothese: bis zu {offer.maxCases} Vorgänge, {offer.durationWeeks} Wochen, {formatMoney(offer.priceMinCents)}–{formatMoney(offer.priceMaxCents)} netto
                  </p>
                )}
                <div className="divide-y divide-line">
                  {qs.map((q) => (
                    <QuestionField key={q.key} discoveryId={id} question={q} answer={d.answers[q.key]} disabled={locked} />
                  ))}
                </div>
              </Card>
            )
          })}
        </TabsContent>

        <TabsContent value="score" className="mt-5 grid gap-4 lg:grid-cols-[1fr_380px]">
          <EvidenceScorePanel discoveryId={id} initial={d.evidence} disabled={locked} />
          <div className="grid content-start gap-4">
            <SignalsPanel discoveryId={id} initial={signals} disabled={locked} />
          </div>
        </TabsContent>

        <TabsContent value="evidence" className="mt-5">
          <EvidenceVsInterpretation companyId={i.companyId} discoveryId={id} items={d.insights} disabled={locked} />
        </TabsContent>
      </Tabs>
    </>
  )
}
