'use client'

import { useEffect, useSyncExternalStore } from 'react'

/** How dictation works in this deployment; set once by the server (see app layout). */
export type ClientVoiceMode = { mode: 'browser' } | { mode: 'server'; testMode: boolean } | { mode: 'off'; reason: string } | { mode: 'loading' }

const LOADING: ClientVoiceMode = { mode: 'loading' }
let current: ClientVoiceMode = LOADING
const listeners = new Set<() => void>()

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useVoiceMode() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    // The server never knows the mode yet; hydration starts from "loading" and then switches.
    () => LOADING,
  )
}

/** Rendered by the server inside the shell; publishes the mode to every dictation button. */
export function VoiceConfig({ value }: { value: Exclude<ClientVoiceMode, { mode: 'loading' }> }) {
  useEffect(() => {
    current = value
    listeners.forEach((fn) => fn())
  }, [value])
  return null
}
