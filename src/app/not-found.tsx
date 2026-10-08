import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
      <div>
        <p className="text-sm text-faint">404</p>
        <h1 className="mt-2 text-xl font-semibold">Diese Seite gibt es nicht.</h1>
        <Link href="/" className="mt-4 inline-block text-sm text-accent hover:underline">
          Zur Übersicht
        </Link>
      </div>
    </main>
  )
}
