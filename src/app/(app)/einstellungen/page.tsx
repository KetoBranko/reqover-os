import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, History } from 'lucide-react'
import { requireSession } from '@/server/auth/session'
import { getSettings } from '@/server/services/settings'
import { aiStatus } from '@/server/ai/provider'
import { voiceMode } from '@/server/stt/provider'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button'
import { AiLevelForm, DeleteOrganizationButton, OrganizationForm, PilotOfferForm, ProfileForm, RemoveDemoButton } from '@/features/settings/forms'
import { formatDate } from '@/lib/format'
import { de } from '@/i18n/de'

export const metadata: Metadata = { title: de.nav.settings }

export default function SettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <SettingsContent />
    </Suspense>
  )
}

const VOICE_TEXT = {
  browser: 'Spracherkennung des Browsers (Chrome, Edge, Safari). Chrome und Edge senden das Audio dafür an den Dienst des Browser-Herstellers.',
  server: 'Umwandlung über den eingerichteten Transkriptionsdienst. ProRendo speichert kein Audio, nur den Text, den du übernimmst.',
} as const

async function SettingsContent() {
  const session = await requireSession()
  const data = await getSettings(session.ctx)
  const role = session.organization.role
  const admin = role !== 'member'
  const ai = aiStatus(Math.max(data.settings.aiLevel, 1), 1)
  const voice = voiceMode()

  return (
    <>
      <PageHeader title={de.nav.settings} description={`${data.name} · deine Rolle: ${de.membershipRole[role]}`} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Dein Profil" />
          <div className="px-5 pb-5">
            <ProfileForm displayName={data.me.displayName} firstName={data.me.firstName} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Organisation" description={admin ? undefined : 'Ändern können Inhaber und Administratoren.'} />
          <div className="px-5 pb-5">
            <OrganizationForm name={data.name} canEdit={admin} />
          </div>
        </Card>

        <Card>
          <CardHeader title="AI-Stufe" description="AI schlägt vor, Daten belegen, du entscheidest." />
          <div className="grid gap-3 px-5 pb-5">
            <AiLevelForm level={data.settings.aiLevel} canEdit={admin} />
            <p className="text-[13px] text-faint">Stufe 3 (Handeln nach Bestätigung) und Stufe 4 (festgelegte Aktionen selbstständig) sind vorbereitet, in dieser Version aber bewusst nicht freigeschaltet.</p>
            <p className="text-[13px] text-muted">
              AI-Anbieter: {ai.available ? (ai.provider === 'fake' ? 'Testmodus, kein echtes Modell' : 'eingerichtet') : ai.reason}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Spracheingabe" />
          <p className="px-5 pb-5 text-sm text-muted">{voice.mode === 'off' ? voice.reason : voice.mode === 'server' && voice.testMode ? 'Testmodus, keine echte Spracherkennung.' : VOICE_TEXT[voice.mode]}</p>
        </Card>

        <Card>
          <CardHeader title="Pilotangebot" description="Grundlage für Gespräche; jedes Discovery speichert den Stand zum Zeitpunkt des Gesprächs." />
          <div className="px-5 pb-5">
            <PilotOfferForm offer={data.settings.pilotOffer} canEdit={admin} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Team" description="Personen mit Zugriff auf diese Organisation." />
          <ul className="divide-y divide-line px-5 pb-3">
            {data.members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">
                    {m.displayName}
                    {m.userId === session.userId && <span className="text-faint"> (du)</span>}
                  </p>
                  <p className="text-[12px] text-faint">seit {formatDate(m.since)}</p>
                </div>
                <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{de.membershipRole[m.role]}</Badge>
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-2 px-5 pb-5 text-[13px] text-faint">
            Weitere Personen einladen <Badge>{de.common.comingSoon}</Badge>
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Daten" description="Nachvollziehen, exportieren und löschen." />
          <div className="grid gap-4 px-5 pb-5">
            <div className="flex flex-wrap gap-2">
              <Link href="/einstellungen/protokoll" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                <History aria-hidden />
                Änderungsprotokoll
              </Link>
              {admin && (
                <a href="/api/export" className={buttonVariants({ variant: 'secondary', size: 'sm' })} download>
                  <Download aria-hidden />
                  Alle Daten exportieren (JSON)
                </a>
              )}
              {admin && data.demoCompanies > 0 && <RemoveDemoButton count={data.demoCompanies} />}
            </div>
            <p className="text-[13px] text-muted">
              Das Änderungsprotokoll zeigt, wer wann was geändert hat, ob ein Mensch oder ProRendo AI, und wer einen AI-Vorschlag bestätigt hat. Einzelne Unternehmen löschst du auf ihrer Seite; Kontakte, Gespräche und Aufgaben werden dabei mit gelöscht.
            </p>
            {role === 'owner' && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
                <p className="text-[13px] text-fg">Organisation mit allen Daten endgültig löschen. Nur für den Inhaber.</p>
                <DeleteOrganizationButton name={data.name} />
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
