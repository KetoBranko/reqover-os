'use client'

import { useId, useState } from 'react'
import * as DM from '@radix-ui/react-dropdown-menu'
import Link from 'next/link'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ArrowRightLeft, CalendarClock, GripVertical, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Select } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { berlinDay, daysBetween, formatMoney, relativeDay } from '@/lib/format'
import type { BoardCard, BoardStage } from '@/server/services/opportunities'
import { useAction } from '@/components/forms/use-action'
import { DemoBadge } from '@/components/status'
import { moveOpportunityAction } from './actions'
import { OutcomeDialog } from './outcome-dialog'
import { OpportunityFormDialog, type Option } from './opportunity-form'

/** An opportunity this long in one open stage is flagged as stalling. */
const STALE_DAYS = 14

interface PendingOutcome {
  card: BoardCard
  stage: BoardStage
}

export function Board({ stages, cards, today, contacts }: { stages: BoardStage[]; cards: BoardCard[]; today: string; contacts: Option[] }) {
  const move = useAction(moveOpportunityAction)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [outcome, setOutcome] = useState<PendingOutcome | null>(null)
  const [dragging, setDragging] = useState<BoardCard | null>(null)
  const [editing, setEditing] = useState<BoardCard | null>(null)
  const dndId = useId()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))

  const stageOf = (c: BoardCard) => overrides[c.id] ?? c.stageId
  const byStage = (stageId: string) => cards.filter((c) => stageOf(c) === stageId)

  async function requestMove(card: BoardCard, stage: BoardStage, extra: { orderConfirmedAt?: string; lostReason?: string; wonWithoutOrder?: boolean } = {}) {
    const decided = Boolean(extra.orderConfirmedAt || extra.lostReason || extra.wonWithoutOrder)
    if (stageOf(card) === stage.id && !decided) return
    if (stage.outcome !== 'open' && !decided) {
      // Ask first: closing an opportunity needs evidence (order) or a reason.
      if (stage.outcome === 'won' && !card.orderConfirmedAt) return setOutcome({ card, stage })
      if (stage.outcome === 'lost') return setOutcome({ card, stage })
    }
    setOverrides((o) => ({ ...o, [card.id]: stage.id }))
    const r = await move.run({ id: card.id, stageKey: stage.key, ...extra })
    // On success the override simply matches the refreshed server data; keeping it
    // avoids the card jumping back for a frame while the refresh arrives.
    if (!r.ok) setOverrides(({ [card.id]: _drop, ...rest }) => rest)
    if (r.ok) {
      setOutcome(null)
      toast.success(`${card.title} → ${stage.name}`)
    } else if (r.error.code === 'needs_confirmation') {
      setOutcome({ card, stage })
    }
  }

  function onDragStart(e: DragStartEvent) {
    setDragging(cards.find((c) => c.id === e.active.id) ?? null)
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const card = cards.find((c) => c.id === e.active.id)
    const stage = stages.find((s) => s.id === e.over?.id)
    if (card && stage) void requestMove(card, stage)
  }

  return (
    <>
      {/* Desktop: Kanban with drag and drop (also keyboard: Space, arrows, Space). */}
      <DndContext id={dndId} sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="-mx-4 hidden overflow-x-auto px-4 pb-4 lg:-mx-8 lg:block lg:px-8">
          <div className="flex min-w-max gap-3">
            {stages.map((stage) => (
              <Column key={stage.id} stage={stage} cards={byStage(stage.id)}>
                {byStage(stage.id).map((c) => (
                  <DraggableCard
                    key={c.id}
                    card={c}
                    today={today}
                    onEdit={() => setEditing(c)}
                    menu={<MoveMenu card={c} stages={stages} current={stageOf(c)} onMove={(s) => void requestMove(c, s)} />}
                  />
                ))}
              </Column>
            ))}
          </div>
        </div>
        <DragOverlay>{dragging && <CardBody card={dragging} today={today} overlay />}</DragOverlay>
      </DndContext>

      {/* Mobile: grouped list; the stage is changed with a native select. */}
      <div className="grid gap-5 lg:hidden">
        {stages.map((stage) => {
          const list = byStage(stage.id)
          if (!list.length) return null
          return (
            <section key={stage.id} aria-label={stage.name}>
              <StageHeading stage={stage} cards={list} />
              <ul className="mt-2 grid gap-2">
                {list.map((c) => (
                  <li key={c.id} className="rounded-xl border border-line bg-surface p-3">
                    <CardBody card={c} today={today} onEdit={() => setEditing(c)} />
                    <label className="mt-3 flex items-center gap-2 text-[12px] text-faint">
                      Phase
                      <Select
                        value={stageOf(c)}
                        onChange={(e) => {
                          const target = stages.find((s) => s.id === e.target.value)
                          if (target) void requestMove(c, target)
                        }}
                        className="h-9 flex-1 text-[13px]"
                        aria-label={`Phase von ${c.title}`}
                      >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {outcome && (
        <OutcomeDialog
          outcome={outcome.stage.outcome as 'won' | 'lost'}
          title={outcome.card.title}
          pending={move.pending}
          onCancel={() => setOutcome(null)}
          onConfirm={(extra) => void requestMove(outcome.card, outcome.stage, extra)}
        />
      )}
      {editing && (
        <OpportunityFormDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing}
          contacts={contacts.filter((c) => c.companyId === editing.companyId)}
        />
      )}
    </>
  )
}

function StageHeading({ stage, cards }: { stage: BoardStage; cards: BoardCard[] }) {
  const sum = cards.reduce((s, c) => s + (c.valueCents ?? 0), 0)
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h2 className={cn('text-[12px] font-semibold uppercase tracking-wider', stage.outcome === 'won' ? 'text-success' : stage.outcome === 'lost' ? 'text-danger' : 'text-muted')}>
        {stage.name} · {cards.length}
      </h2>
      {sum > 0 && <span className="tabular text-[12px] text-faint">{formatMoney(sum)}</span>}
    </div>
  )
}

function Column({ stage, cards, children }: { stage: BoardStage; cards: BoardCard[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  return (
    <section
      ref={setNodeRef}
      aria-label={stage.name}
      className={cn('flex w-64 shrink-0 flex-col rounded-xl border border-line bg-surface/50 p-2 transition-colors', isOver && 'border-accent/50 bg-accent-soft/40')}
    >
      <div className="px-1 pb-2 pt-1">
        <StageHeading stage={stage} cards={cards} />
      </div>
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </section>
  )
}

function DraggableCard({ card, today, onEdit, menu }: { card: BoardCard; today: string; onEdit: () => void; menu: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id })
  return (
    <div ref={setNodeRef} className={cn('rounded-lg border border-line bg-surface p-3', isDragging && 'opacity-40')}>
      <CardBody card={card} today={today} onEdit={onEdit} handle={{ ...attributes, ...listeners }} menu={menu} />
    </div>
  )
}

/** Keyboard- and screen-reader-friendly alternative to dragging. */
function MoveMenu({ card, stages, current, onMove }: { card: BoardCard; stages: BoardStage[]; current: string; onMove: (s: BoardStage) => void }) {
  return (
    <DM.Root>
      <DM.Trigger aria-label={`Phase von ${card.title} ändern`} className="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg">
        <ArrowRightLeft className="size-3.5" aria-hidden />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={4} className="z-50 min-w-52 rounded-lg border border-line-strong bg-surface-2 p-1 shadow-xl">
          <DM.Label className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Verschieben nach</DM.Label>
          {stages.map((s) => (
            <DM.Item
              key={s.id}
              disabled={s.id === current}
              onSelect={() => onMove(s)}
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-muted outline-none data-[disabled]:cursor-default data-[disabled]:opacity-40 data-[highlighted]:bg-surface-3 data-[highlighted]:text-fg"
            >
              {s.name}
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}

function CardBody({
  card,
  today,
  onEdit,
  handle,
  menu,
  overlay,
}: {
  card: BoardCard
  today: string
  onEdit?: () => void
  handle?: React.HTMLAttributes<HTMLButtonElement>
  menu?: React.ReactNode
  overlay?: boolean
}) {
  const daysInStage = daysBetween(berlinDay(new Date(card.stageChangedAt)), today)
  const overdue = card.nextStepDate != null && card.nextStepDate < today
  const isClosed = card.lostReason != null || card.orderConfirmedAt != null || card.wonWithoutOrder
  return (
    <div className={cn(overlay && 'w-60 rounded-lg border border-accent/50 bg-surface-2 p-3 shadow-2xl')}>
      <div className="flex items-start gap-1.5">
        {handle && (
          <button {...handle} aria-label={`${card.title} verschieben`} className="-ml-1 mt-0.5 cursor-grab rounded p-0.5 text-faint hover:text-fg active:cursor-grabbing">
            <GripVertical className="size-4" aria-hidden />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <Link href={`/unternehmen/${card.companyId}`} className="block truncate text-[13px] text-muted hover:text-accent">
            {card.companyName}
          </Link>
          <p className="mt-0.5 text-sm font-medium leading-snug text-fg">{card.title}</p>
        </div>
        {menu}
        {onEdit && (
          <button onClick={onEdit} aria-label={`${card.title} bearbeiten`} className="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg">
            <Pencil className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
        {card.valueCents != null && <span className="tabular text-fg">{formatMoney(card.valueCents)}</span>}
        {card.contactName && <span>{card.contactName}</span>}
        {card.evidence && (
          <span title={`${card.evidence.rated} von 10 Kategorien bewertet`} className="text-muted">
            Evidence {card.evidence.points}/20
          </span>
        )}
        {card.isDemo && <DemoBadge />}
      </div>
      {card.nextStep && (
        <p className={cn('mt-2 flex items-start gap-1.5 text-[12px]', overdue ? 'text-danger' : 'text-muted')}>
          <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            {card.nextStep}
            {card.nextStepDate && ` · ${relativeDay(card.nextStepDate, today)}`}
          </span>
        </p>
      )}
      {card.lastActivityAt && (
        <p className="mt-2 text-[12px] text-faint">Letzte Aktivität: {relativeDay(berlinDay(new Date(card.lastActivityAt)), today)}</p>
      )}
      {card.lostReason && <p className="mt-2 text-[12px] text-danger">Grund: {card.lostReason}</p>}
      {card.wonWithoutOrder && <p className="mt-2 text-[12px] text-warning">Ohne dokumentierten Auftrag</p>}
      {!isClosed && daysInStage >= STALE_DAYS && (
        <p className="mt-2 text-[12px] text-warning">Seit {daysInStage} Tagen in dieser Phase</p>
      )}
      {!card.nextStep && !isClosed && <p className="mt-2 text-[12px] text-warning">Kein nächster Schritt festgelegt</p>}
    </div>
  )
}
