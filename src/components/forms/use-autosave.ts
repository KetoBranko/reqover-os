'use client'

import { useCallback, useRef, useState } from 'react'
import type { ActionResult } from '@/lib/result'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Saves that are scheduled but not sent yet, and saves in flight, across all fields.
const scheduled = new Map<symbol, () => Promise<void>>()
const inFlight = new Set<Promise<void>>()

/** Sends every scheduled save now and waits for all saves (e.g. before an analysis reads the notes). */
export async function flushAllAutosaves() {
  const now = [...scheduled.values()].map((run) => run())
  await Promise.all([...now, ...inFlight])
}

/**
 * Debounced autosave for long-form fields. Latest value wins; a failed save
 * keeps the text on screen and shows an error so nothing typed is lost.
 */
export function useAutosave<T>(save: (value: T) => Promise<ActionResult<unknown>>, delay = 700) {
  const [state, setState] = useState<SaveState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const seq = useRef(0)
  const key = useRef(Symbol('autosave'))

  const flush = useCallback(
    async (value: T) => {
      clearTimeout(timer.current)
      scheduled.delete(key.current)
      const mine = ++seq.current
      setState('saving')
      const run = (async () => {
        try {
          const r = await save(value)
          if (mine === seq.current) setState(r.ok ? 'saved' : 'error')
        } catch {
          if (mine === seq.current) setState('error')
        }
      })()
      inFlight.add(run)
      await run
      inFlight.delete(run)
    },
    [save],
  )

  const schedule = useCallback(
    (value: T) => {
      clearTimeout(timer.current)
      setState('saving')
      scheduled.set(key.current, () => flush(value))
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
