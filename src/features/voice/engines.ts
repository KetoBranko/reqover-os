'use client'

/**
 * Dictation engines behind one shape, so the UI does not care whether the
 * browser recognises speech itself or audio goes to the server provider.
 * Recording only ever starts from an explicit user action and stops with the
 * next one (or after MAX_SECONDS); there is no background recording.
 */
export interface DictationCallbacks {
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onProcessing: () => void
  onError: (message: string) => void
  onEnd: () => void
}

export interface DictationSession {
  stop: () => void
  cancel: () => void
}

export const MAX_SECONDS = 180

export const VOICE_ERRORS = {
  unsupported: 'Spracheingabe wird in diesem Browser nicht unterstützt. Nutze Chrome, Edge oder Safari, oder tippe den Text.',
  denied: 'Kein Zugriff auf das Mikrofon. Du kannst ihn in den Einstellungen des Browsers erlauben.',
  noMic: 'Es wurde kein Mikrofon gefunden.',
  network: 'Die Spracherkennung ist gerade nicht erreichbar. Bitte noch einmal versuchen oder tippen.',
  failed: 'Die Spracheingabe hat nicht funktioniert. Bitte noch einmal versuchen oder tippen.',
} as const

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function browserSupported() {
  return recognitionClass() !== null
}

export function serverSupported() {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

export function startBrowserDictation(cb: DictationCallbacks): DictationSession | null {
  const Rec = recognitionClass()
  if (!Rec) {
    cb.onError(VOICE_ERRORS.unsupported)
    return null
  }
  const rec = new Rec()
  rec.lang = 'de-DE'
  rec.continuous = true
  rec.interimResults = true
  let finalText = ''
  let cancelled = false
  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]!
      if (r.isFinal) finalText += `${finalText ? ' ' : ''}${r[0].transcript.trim()}`
      else interim += r[0].transcript
    }
    cb.onPartial([finalText, interim.trim()].filter(Boolean).join(' '))
  }
  rec.onerror = (e) => {
    if (e.error === 'aborted' || e.error === 'no-speech') return
    cb.onError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? VOICE_ERRORS.denied : e.error === 'audio-capture' ? VOICE_ERRORS.noMic : e.error === 'network' ? VOICE_ERRORS.network : VOICE_ERRORS.failed)
  }
  rec.onend = () => {
    clearTimeout(limit)
    if (!cancelled && finalText.trim()) cb.onFinal(finalText.trim())
    cb.onEnd()
  }
  const limit = setTimeout(() => rec.stop(), MAX_SECONDS * 1000)
  try {
    rec.start()
  } catch {
    clearTimeout(limit)
    cb.onError(VOICE_ERRORS.failed)
    return null
  }
  return {
    stop: () => rec.stop(),
    cancel: () => {
      cancelled = true
      rec.abort()
    },
  }
}

export async function startServerDictation(cb: DictationCallbacks): Promise<DictationSession | null> {
  if (!serverSupported()) {
    cb.onError(VOICE_ERRORS.unsupported)
    return null
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    cb.onError(name === 'NotAllowedError' || name === 'SecurityError' ? VOICE_ERRORS.denied : name === 'NotFoundError' ? VOICE_ERRORS.noMic : VOICE_ERRORS.failed)
    return null
  }
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  let cancelled = false
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  recorder.onstop = async () => {
    clearTimeout(limit)
    stream.getTracks().forEach((t) => t.stop())
    if (cancelled) return cb.onEnd()
    cb.onProcessing()
    try {
      const form = new FormData()
      form.append('audio', new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), 'diktat')
      const res = await fetch('/api/sprache', { method: 'POST', body: form })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; text?: string; message?: string } | null
      if (!res.ok || !json?.ok) cb.onError(json?.message ?? VOICE_ERRORS.failed)
      else if (json.text?.trim()) cb.onFinal(json.text.trim())
    } catch {
      cb.onError(VOICE_ERRORS.network)
    }
    cb.onEnd()
  }
  const limit = setTimeout(() => recorder.state === 'recording' && recorder.stop(), MAX_SECONDS * 1000)
  recorder.start()
  return {
    stop: () => recorder.state === 'recording' && recorder.stop(),
    cancel: () => {
      cancelled = true
      if (recorder.state === 'recording') recorder.stop()
    },
  }
}
