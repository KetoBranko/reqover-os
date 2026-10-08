'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { safeNext } from '@/lib/redirect'

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const form = new FormData(e.currentTarget)
    const { error: authError } = await supabaseBrowser().auth.signInWithPassword({
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? ''),
    })
    if (authError) {
      setPending(false)
      setError(
        authError.status === 400 || authError.status === 401
          ? 'E-Mail oder Passwort ist nicht korrekt.'
          : authError.status === 429
            ? 'Zu viele Anmeldeversuche. Bitte warte einen Moment.'
            : 'Anmeldung gerade nicht möglich. Bitte versuche es erneut.',
      )
      return
    }
    router.replace(safeNext(new URLSearchParams(window.location.search).get('weiter')))
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
      <Field label="E-Mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Passwort" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2">
        Anmelden
      </Button>
      <p className="text-center text-[13px] text-faint">Zugänge werden per Einladung vergeben.</p>
    </form>
  )
}

