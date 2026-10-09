import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/server/auth/session'
import { SetupForm } from './setup-form'

export const metadata: Metadata = { title: 'Einrichtung' }

export default function SetupPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">ProRendo einrichten</h1>
      <p className="mt-2 text-sm text-muted">
        Lege deine Organisation an. Pipeline-Stufen und der Discovery-Leitfaden werden automatisch vorbereitet.
      </p>
      <Suspense fallback={null}>
        <Guard />
      </Suspense>
      <SetupForm />
    </>
  )
}

async function Guard() {
  const session = await getSession()
  if (!session) redirect('/anmelden')
  if (session.organization) redirect('/')
  return null
}
