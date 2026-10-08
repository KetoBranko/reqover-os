'use client'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body style={{ background: '#111214', color: '#e8e9ec', fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100dvh', margin: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 18 }}>Etwas ist schiefgelaufen.</h1>
          <button onClick={reset} style={{ marginTop: 16, padding: '8px 14px', borderRadius: 8, border: '1px solid #333', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  )
}
