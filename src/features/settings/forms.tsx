'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAction } from '@/components/forms/use-action'
import { parseMoneyToCents } from '@/lib/format'
import type { PilotOffer } from '@/domain/settings'
import { cn } from '@/lib/cn'
import { deleteOrganizationAction, removeDemoDataAction, renameOrganizationAction, updateAiLevelAction, updatePilotOfferAction, updateProfileAction } from './actions'

const euro = (cents: number) => (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function ProfileForm({ displayName, firstName }: { displayName: string; firstName: string | null }) {
  const save = useAction(updateProfileAction, { success: 'Profil gespeichert.' })
  const fe = save.error?.fieldErrors ?? {}
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        void save.run({ displayName: f.get('displayName'), firstName: f.get('firstName') })
      }}
    >
      <Field label="Anzeigename" htmlFor="p-name" error={fe.displayName}>
        <Input id="p-name" name="displayName" defaultValue={displayName} required maxLength={120} />
      </Field>
      <Field label="Vorname (für die Begrüßung)" htmlFor="p-first" error={fe.firstName}>
        <Input id="p-first" name="firstName" defaultValue={firstName ?? ''} maxLength={80} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" loading={save.pending}>
          Profil speichern
        </Button>
      </div>
    </form>
  )
}

export function OrganizationForm({ name, canEdit }: { name: string; canEdit: boolean }) {
  const save = useAction(renameOrganizationAction, { success: 'Name gespeichert.' })
  if (!canEdit) return <p className="text-sm text-fg">{name}</p>
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save.run({ name: new FormData(e.currentTarget).get('name') })
      }}
    >
      <Field label="Name der Organisation" htmlFor="o-name" error={save.error?.fieldErrors?.name} className="min-w-60 flex-1">
        <Input id="o-name" name="name" defaultValue={name} required maxLength={200} />
      </Field>
      <Button type="submit" size="sm" loading={save.pending} className="mb-1">
        Speichern
      </Button>
    </form>
  )
}

const LEVELS = [
  { level: 0, title: 'Aus', text: 'Keine AI-Funktionen. Alles bleibt manuell nutzbar.' },
  { level: 1, title: 'Lesen und analysieren', text: 'Der Assistent beantwortet Fragen aus deinen Daten, schlägt aber keine Änderungen vor.' },
  { level: 2, title: 'Vorschlagen (empfohlen)', text: 'AI wertet Gespräche aus und schlägt Änderungen vor. Gespeichert wird erst, was du bestätigst.' },
] as const

export function AiLevelForm({ level, canEdit }: { level: number; canEdit: boolean }) {
  const save = useAction(updateAiLevelAction, { success: 'AI-Stufe gespeichert.' })
  return (
    <fieldset className="grid gap-2" disabled={!canEdit || save.pending}>
      <legend className="sr-only">AI-Stufe</legend>
      {LEVELS.map((l) => (
        <label
          key={l.level}
          className={cn('flex cursor-pointer gap-3 rounded-lg border px-4 py-3', level === l.level ? 'border-accent/50 bg-accent-soft/30' : 'border-line hover:border-line-strong', !canEdit && 'cursor-default')}
        >
          <input type="radio" name="aiLevel" value={l.level} checked={level === l.level} onChange={() => void save.run({ aiLevel: l.level })} className="mt-1 accent-[var(--accent)]" />
          <span>
            <span className="block text-sm font-medium text-fg">
              Stufe {l.level}: {l.title}
            </span>
            <span className="block text-[13px] text-muted">{l.text}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export function PilotOfferForm({ offer, canEdit }: { offer: PilotOffer; canEdit: boolean }) {
  const save = useAction(updatePilotOfferAction, { success: 'Pilotangebot gespeichert.' })
  const [moneyError, setMoneyError] = useState<string | null>(null)
  const fe = save.error?.fieldErrors ?? {}
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const priceMinCents = parseMoneyToCents(String(f.get('min') ?? ''))
        const priceMaxCents = parseMoneyToCents(String(f.get('max') ?? ''))
        if (priceMinCents == null || priceMaxCents == null) return setMoneyError('Bitte Beträge wie 2.500 oder 2.500,00 eingeben.')
        setMoneyError(null)
        void save.run({ maxCases: Number(f.get('cases')), durationWeeks: Number(f.get('weeks')), priceMinCents, priceMaxCents })
      }}
    >
      <Field label="Fälle (höchstens)" htmlFor="po-cases" error={fe.maxCases}>
        <Input id="po-cases" name="cases" type="number" min={1} max={100000} defaultValue={offer.maxCases} disabled={!canEdit} required />
      </Field>
      <Field label="Laufzeit (Wochen)" htmlFor="po-weeks" error={fe.durationWeeks}>
        <Input id="po-weeks" name="weeks" type="number" min={1} max={104} defaultValue={offer.durationWeeks} disabled={!canEdit} required />
      </Field>
      <Field label="Preis von (€)" htmlFor="po-min" error={moneyError ?? fe.priceMinCents}>
        <Input id="po-min" name="min" inputMode="decimal" defaultValue={euro(offer.priceMinCents)} disabled={!canEdit} required />
      </Field>
      <Field label="Preis bis (€)" htmlFor="po-max" error={fe.priceMaxCents}>
        <Input id="po-max" name="max" inputMode="decimal" defaultValue={euro(offer.priceMaxCents)} disabled={!canEdit} required />
      </Field>
      {canEdit && (
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" loading={save.pending}>
            Pilotangebot speichern
          </Button>
        </div>
      )}
    </form>
  )
}

export function RemoveDemoButton({ count }: { count: number }) {
  const remove = useAction(removeDemoDataAction, { success: 'Demo-Daten entfernt.' })
  return (
    <Button
      variant="outline"
      size="sm"
      loading={remove.pending}
      onClick={() => {
        if (window.confirm(`Alle als Demo markierten Einträge (${count} Unternehmen mit Kontakten, Chancen, Gesprächen, Aufgaben und Aktivitäten) endgültig entfernen? Echte Daten bleiben unberührt.`)) void remove.run({})
      }}
    >
      Demo-Daten entfernen
    </Button>
  )
}

export function DeleteOrganizationButton({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const del = useAction(deleteOrganizationAction)
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        setTyped('')
      }}
    >
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Organisation löschen
      </Button>
      <DialogContent title="Organisation endgültig löschen" description="Alle Unternehmen, Kontakte, Gespräche, Aufgaben, Aktivitäten, Vorschläge und das Änderungsprotokoll werden gelöscht. Das lässt sich nicht rückgängig machen.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void del.run({ confirmName: typed })
          }}
        >
          <p className="text-sm text-muted">Lade vorher am besten einen Export herunter.</p>
          <Field label={`Zur Bestätigung „${name}“ eingeben`} htmlFor="del-name" error={del.error?.message}>
            <Input id="del-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={typed !== name} loading={del.pending}>
              Endgültig löschen
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
