'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { createOrganization } from '@/features/onboarding/actions'

export function SetupForm() {
  const [state, action, pending] = useActionState(createOrganization, null)
  const error = state && !state.ok ? state.error : null
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <Field label="Name der Organisation" htmlFor="name" error={error?.fieldErrors?.name}>
        <Input id="name" name="name" defaultValue="ProRendo" required aria-invalid={Boolean(error?.fieldErrors?.name)} />
      </Field>
      {error && !error.fieldErrors && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error.message}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Organisation anlegen
      </Button>
    </form>
  )
}
