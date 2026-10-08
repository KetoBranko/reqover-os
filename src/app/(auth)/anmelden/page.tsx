import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Anmelden' }

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Willkommen zurück.</h1>
      <p className="mt-2 text-sm text-muted">Melde dich mit deinem ReQover-Konto an.</p>
      <LoginForm />
    </>
  )
}
