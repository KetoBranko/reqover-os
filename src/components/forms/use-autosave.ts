'use client'

import { useCallback, useRef, useState } from 'react'
import type { ActionResult } from '@/lib/result'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Debounced autosave for long-form fields. Latest value wins; a failed save
 * keeps the text on screen and shows an error so nothing typed is lost.
 */
export function useAutosave<T>(save: (value: T) => Promise<ActionResult<unknown>>, delay = 700) {
  const [state, setState] = useState<SaveState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const seq = useRef(0)

  const flush = useCallback(
    async (value: T) => {
      clearTimeout(timer.current)
      const mine = ++seq.current
      setState('saving')
      try {
        const r = await save(value)
        if (mine === seq.current) setState(r.ok ? 'saved' : 'error')
      } catch {
        if (mine === seq.current) setState('error')
      }
    },
    [save],
  )

  const schedule = useCallback(
    (value: T) => {
      clearTimeout(timer.current)
      setState('saving')
      timer.current = setTimeout(() => void flush(value), delay)
    },
    [flush, delay],
  )

  return { state, schedule, flush }
}

export const SAVE_LABEL: Record<SaveState, string> = {
  idle: '',
  saving: 'Speichert …',
  saved: 'Gespeichert',
  error: 'Nicht gespeichert – bitte erneut versuchen',
}
