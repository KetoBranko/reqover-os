'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { browserSupported, startBrowserDictation, startServerDictation, VOICE_ERRORS, type DictationSession } from './engines'
import { useVoiceMode } from './voice-config'

export type DictationState = 'idle' | 'listening' | 'processing'

/** Start/stop dictation; finished text goes to onText. Only one session at a time per hook. */
export function useDictation(onText: (text: string) => void) {
  const mode = useVoiceMode()
  const [state, setState] = useState<DictationState>('idle')
  const [partial, setPartial] = useState('')
  const session = useRef<DictationSession | null>(null)
  const textRef = useRef(onText)
  useEffect(() => {
    textRef.current = onText
  }, [onText])

  // Leaving the page or closing a dialog ends the recording; nothing keeps listening in the background.
  useEffect(() => () => session.current?.cancel(), [])

  const start = useCallback(async () => {
    if (session.current || (mode.mode !== 'browser' && mode.mode !== 'server')) return
    if (mode.mode === 'browser' && !browserSupported()) {
      toast.error(VOICE_ERRORS.unsupported)
      return
    }
    setPartial('')
    setState('listening')
    const callbacks = {
      onPartial: setPartial,
      onFinal: (t: string) => textRef.current(t),
      onProcessing: () => setState('processing'),
      onError: (m: string) => toast.error(m),
      onEnd: () => {
        session.current = null
        setPartial('')
        setState('idle')
      },
    }
    const s = mode.mode === 'browser' ? startBrowserDictation(callbacks) : await startServerDictation(callbacks)
    if (!s) setState('idle')
    session.current = s
  }, [mode])

  const stop = useCallback(() => session.current?.stop(), [])

  return { available: mode.mode === 'browser' || mode.mode === 'server', testMode: mode.mode === 'server' && mode.testMode, state, partial, start, stop }
}

/**
 * Microphone button with a visible recording state. Appends the dictated text
 * via onText; the user sees and can edit it before anything is saved.
 */
export function DictateButton({
  onText,
  label = 'Diktieren',
  compact,
  autoStart,
  className,
}: {
  onText: (text: string) => void
  label?: string
  compact?: boolean
  autoStart?: boolean
  className?: string
}) {
  const d = useDictation(onText)
  const started = useRef(false)
  useEffect(() => {
    if (autoStart && d.available && !started.current) {
      started.current = true
      void d.start()
    }
  }, [autoStart, d])

  if (!d.available) return null
  const listening = d.state === 'listening'
  const processing = d.state === 'processing'
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Button
        type="button"
        variant={listening ? 'danger' : 'secondary'}
        size={compact ? 'icon' : 'sm'}
        onClick={() => (listening ? d.stop() : void d.start())}
        disabled={processing}
        aria-pressed={listening}
        aria-label={listening ? 'Diktat beenden' : label}
        title={listening ? 'Diktat beenden' : label}
      >
        {processing ? <Loader2 className="animate-spin" aria-hidden /> : listening ? <Square className="fill-current" aria-hidden /> : <Mic aria-hidden />}
        {!compact && <span>{listening ? 'Stopp' : processing ? 'Wird umgewandelt …' : label}</span>}
      </Button>
      {(listening || processing) && (
        <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted" role="status" aria-live="polite">
          {listening && (
            <span className="relative flex size-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-danger" />
            </span>
          )}
          <span className="truncate">{listening ? d.partial || 'Mikrofon an · sprich jetzt' : 'Text wird erstellt …'}</span>
        </p>
      )}
    </div>
  )
}

/** Appends dictated text to existing text on a new line. */
export function appendText(current: string, text: string) {
  return current.trim() ? `${current.replace(/\s+$/, '')}\n${text}` : text
}
