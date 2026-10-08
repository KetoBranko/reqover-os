'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { relativeDay, daysBetween } from '@/lib/format'
import { PriorityDot } from '@/components/status'
import { Badge } from '@/components/ui/badge'
import { useAction } from '@/components/forms/use-action'
import { deleteTaskAction, setTaskDoneAction } from './actions'
import { TaskFormDialog, type Option } from './task-form'
import { QuickNoteDialog } from '@/features/activities/activity-form'

export interface TaskRow {
  id: string
  title: string
  context: string | null
  description: string | null
  dueDate: string | null
  priority: 'low' | 'normal' | 'high'
  status: 'open' | 'done' | 'cancelled'
  origin: 'human' | 'ai' | 'system'
  companyId: string | null
  contactId: string | null
  opportunityId: string | null
  discoveryId: string | null
  companyName?: string | null
  contactName?: string | null
}

export function TaskList({ tasks, today, showCompany = true, companies, contacts }: { tasks: TaskRow[]; today: string; showCompany?: boolean; companies?: Option[]; contacts?: Option[] }) {
  return (
    <ul className="divide-y divide-line">
      {tasks.map((t) => (
        <TaskItem key={t.id} task={t} today={today} showCompany={showCompany} companies={companies} contacts={contacts} />
      ))}
    </ul>
  )
}

function TaskItem({ task, today, showCompany, companies, contacts }: { task: TaskRow; today: string; showCompany: boolean; companies?: Option[]; contacts?: Option[] }) {
  const toggle = useAction(setTaskDoneAction)
  const remove = useAction(deleteTaskAction, { success: 'Aufgabe gelöscht.' })
  const [editing, setEditing] = useState(false)
  const [noteFor, setNoteFor] = useState<{ companyId: string | null; contactId: string | null; title: string } | null>(null)
  const done = task.status === 'done'
  const overdue = !done && task.dueDate && daysBetween(today, task.dueDate) < 0

  async function onToggle() {
    const r = await toggle.run({ id: task.id, done: !done })
    if (r.ok && !done) {
      toast.success('Erledigt.', {
        action: { label: 'Notiz dazu', onClick: () => setNoteFor(r.data) },
      })
    }
  }

  return (
    <li className="group flex items-start gap-3 py-3">
      <button
        onClick={onToggle}
        disabled={toggle.pending}
        aria-label={done ? 'Als offen markieren' : 'Als erledigt markieren'}
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
          done ? 'border-success bg-success text-bg' : 'border-line-strong hover:border-accent',
        )}
      >
        {done && <Check className="size-3.5" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn('text-sm', done ? 'text-faint line-through' : 'text-fg')}>{task.title}</span>
          <PriorityDot priority={task.priority} />
          {task.origin === 'ai' && <Badge tone="accent">AI</Badge>}
        </div>
        {task.context && <p className="mt-0.5 text-[13px] text-muted">{task.context}</p>}
        <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-faint">
          {task.dueDate && <span className={cn('tabular', overdue && 'font-medium text-danger')}>{overdue ? 'überfällig · ' : ''}{relativeDay(task.dueDate, today)}</span>}
          {showCompany && task.companyName && task.companyId && (
            <Link href={`/unternehmen/${task.companyId}`} className="hover:text-accent">
              {task.companyName}
            </Link>
          )}
          {task.contactName && task.contactId && (
            <Link href={`/kontakte/${task.contactId}`} className="hover:text-accent">
              {task.contactName}
            </Link>
          )}
        </div>
      </div>
      {!done && (
        <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button onClick={() => setEditing(true)} className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-fg" aria-label="Aufgabe bearbeiten">
            <Pencil className="size-4" />
          </button>
          <button
            onClick={() => remove.run({ id: task.id })}
            className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-danger"
            aria-label="Aufgabe löschen"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
      {editing && <TaskFormDialog open={editing} onOpenChange={setEditing} initial={task} companies={companies} contacts={contacts} />}
      {noteFor && (
        <QuickNoteDialog
          open
          onOpenChange={(o) => !o && setNoteFor(null)}
          companyId={noteFor.companyId}
          contactId={noteFor.contactId}
          defaultTitle={`Notiz zu: ${noteFor.title}`}
          taskId={task.id}
        />
      )}
    </li>
  )
}
