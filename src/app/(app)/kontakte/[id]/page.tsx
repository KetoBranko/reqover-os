import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Link2, Mail, Phone } from 'lucide-react'
import { requireSession } from '@/server/auth/session'
import { getContact } from '@/server/services/contacts'
import { Skeleton, EmptyState } from '@/components/ui/states'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EditContactButton } from '@/features/contacts/contact-form'
import { NewActivityButton } from '@/features/activities/activity-form'
import { NewTaskButton } from '@/features/tasks/task-form'
import { TaskList } from '@/features/tasks/task-list'
import { Timeline } from '@/features/activities/timeline'
import { de } from '@/i18n/de'
import { berlinDay, formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Kontakt' }

export default function ContactPage({ params }: PageProps<'/kontakte/[id]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      {params.then(({ id }) => (
        <ContactView id={id} />
      ))}
    </Suspense>
  )
}

async function ContactView({ id }: { id: string }) {
  const session = await requireSession()
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const data = await getContact(session.ctx, id)
  if (!data) notFound()
  const { contact: c, companyName, openTasks, timeline } = data
  const name = `${c.firstName} ${c.lastName}`.trim()
  const today = berlinDay()
  const lastContact = timeline.find((a) => ['call', 'meeting', 'email', 'discovery'].includes(a.type))

  return (
    <>
      <nav className="mb-3 text-[13px] text-faint" aria-label="Pfad">
        <Link href="/kontakte" className="hover:text-fg">
          {de.nav.contacts}
        </Link>
      </nav>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="mt-1 text-sm text-muted">
            {c.jobTitle ? `${c.jobTitle} · ` : ''}
            <Link href={`/unternehmen/${c.companyId}`} className="text-fg hover:text-accent">
              {companyName}
            </Link>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{de.decisionRole[c.decisionRole]}</Badge>
            <Badge tone="outline">{de.relationshipStatus[c.relationshipStatus]}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <NewActivityButton label="Notiz" companyId={c.companyId} contactId={c.id} />
          <NewTaskButton label="Aufgabe" variant="secondary" initial={{ companyId: c.companyId, contactId: c.id }} />
          <EditContactButton initial={c} />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader title="Kontaktdaten" />
            <CardBody className="grid gap-2 text-sm">
              {c.phone ? (
                <a href={`tel:${c.phone}`} className="flex items-center gap-2 hover:text-accent">
                  <Phone className="size-4 text-faint" aria-hidden />
                  {c.phone}
                </a>
              ) : null}
              {c.email ? (
                <a href={`mailto:${c.email}`} className="flex items-center gap-2 break-all hover:text-accent">
                  <Mail className="size-4 shrink-0 text-faint" aria-hidden />
                  {c.email}
                </a>
              ) : null}
              {c.linkedinUrl ? (
                <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-accent">
                  <Link2 className="size-4 text-faint" aria-hidden />
                  LinkedIn-Profil
                </a>
              ) : null}
              {!c.phone && !c.email && !c.linkedinUrl && <p className="text-faint">Keine Kontaktdaten hinterlegt.</p>}
              <p className="mt-2 text-[13px] text-muted">Letzter Kontakt: {lastContact ? formatDate(lastContact.occurredAt) : '–'}</p>
            </CardBody>
          </Card>
          {c.notes && (
            <Card>
              <CardHeader title="Notizen" />
              <CardBody>
                <p className="whitespace-pre-line text-sm text-muted">{c.notes}</p>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Offene Aufgaben" />
            <CardBody className="pt-0">
              {openTasks.length ? <TaskList tasks={openTasks} today={today} showCompany={false} /> : <p className="text-sm text-faint">Keine offenen Aufgaben.</p>}
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Verlauf" />
          <CardBody>
            {timeline.length ? (
              <Timeline entries={timeline} />
            ) : (
              <EmptyState title="Noch kein Verlauf" description="Dokumentierte Gespräche, Anrufe und Notizen mit dieser Person erscheinen hier." />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  )
}
