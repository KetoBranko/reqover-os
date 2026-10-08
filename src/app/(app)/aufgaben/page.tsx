import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CheckSquare } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { Card, CardHeader } from '@/components/ui/card'
import { NewTaskButton } from '@/features/tasks/task-form'
import { TaskList, type TaskRow } from '@/features/tasks/task-list'
import { requireSession } from '@/server/auth/session'
import { listTasks } from '@/server/services/tasks'
import { companyOptions } from '@/server/services/companies'
import { contactOptions } from '@/server/services/contacts'
import { de } from '@/i18n/de'
import { addDays, berlinDay, daysBetween } from '@/lib/format'
import { str } from '@/lib/params'

export const metadata: Metadata = { title: 'Aufgaben' }

export default function TasksPage({ searchParams }: PageProps<'/aufgaben'>) {
  return (
    <>
      <PageHeader
        title={de.nav.tasks}
        description="Alles, was als Nächstes zu tun ist, mit Kontext."
        actions={
          <Suspense fallback={null}>
            {searchParams.then((p) => (
              <NewTaskAction key={str(p.neu) ?? 'x'} autoOpen={Boolean(str(p.neu))} />
            ))}
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton className="h-72" />}>
        <TaskGroups />
      </Suspense>
    </>
  )
}

async function NewTaskAction({ autoOpen }: { autoOpen: boolean }) {
  const session = await requireSession()
  const [companies, contacts] = await Promise.all([companyOptions(session.ctx), contactOptions(session.ctx)])
  return <NewTaskButton companies={companies} contacts={contacts} autoOpen={autoOpen} />
}

async function TaskGroups() {
  const session = await requireSession()
  const [open, done, companies, contacts] = await Promise.all([
    listTasks(session.ctx, { status: 'open' }),
    listTasks(session.ctx, { status: 'done', limit: 20 }),
    companyOptions(session.ctx),
    contactOptions(session.ctx),
  ])
  const today = berlinDay()
  const rows = (list: typeof open): TaskRow[] => list.map(({ task, companyName, contactName }) => ({ ...task, companyName, contactName }))
  const all = rows(open)
  const weekEnd = addDays(today, 7)
  const groups: { title: string; items: TaskRow[]; tone?: string }[] = [
    { title: 'Überfällig', items: all.filter((t) => t.dueDate && daysBetween(today, t.dueDate) < 0), tone: 'text-danger' },
    { title: 'Heute', items: all.filter((t) => t.dueDate === today) },
    { title: 'Nächste 7 Tage', items: all.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= weekEnd) },
    { title: 'Später', items: all.filter((t) => t.dueDate && t.dueDate > weekEnd) },
    { title: 'Ohne Termin', items: all.filter((t) => !t.dueDate) },
  ]

  if (!all.length && !done.length) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="Keine Aufgaben"
        description="Aufgaben entstehen aus Gesprächen, Wiedervorlagen oder direkt hier. Am besten immer mit Unternehmen und Grund."
        actions={<NewTaskButton label="Erste Aufgabe erstellen" companies={companies} contacts={contacts} />}
      />
    )
  }

  return (
    <div className="grid gap-4">
      {!all.length && <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">Alles erledigt. Keine offenen Aufgaben.</p>}
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <Card key={g.title}>
            <CardHeader title={<span className={g.tone}>{`${g.title} · ${g.items.length}`}</span>} />
            <div className="px-5 pb-2">
              <TaskList tasks={g.items} today={today} companies={companies} contacts={contacts} />
            </div>
          </Card>
        ))}
      {done.length > 0 && (
        <Card>
          <CardHeader title="Zuletzt erledigt" />
          <div className="px-5 pb-2">
            <TaskList tasks={rows(done)} today={today} />
          </div>
        </Card>
      )}
    </div>
  )
}
