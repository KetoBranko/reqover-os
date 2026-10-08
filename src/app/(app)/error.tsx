'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/ui/states'
import { de } from '@/i18n/de'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return <ErrorState message={de.errors.generic} onRetry={reset} />
}
