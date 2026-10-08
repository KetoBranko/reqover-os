import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Anmelden' }

export default function LoginPage({ searchParams }: PageProps<'/anmelden'>) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Willkommen zurück.</h1>
      <p className="mt-2 text-sm text-muted">Melde dich mit deinem ReQover-Konto an.</p>
      <Suspense fallback={<LoginForm next="/" />}>
        {searchParams.then(({ weiter }) => (
          <LoginForm next={safeNext(weiter)} />
        ))}
      </Suspense>
    </>
  )
}

// Only allow internal redirect targets (no open redirects).
function safeNext(value: string | string[] | undefined): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}
