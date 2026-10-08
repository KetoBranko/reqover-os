import 'server-only'
import { env } from '@/server/env'

/**
 * Speech-to-text behind one interface, so the provider can change without
 * touching the UI. "browser" means the browser's own speech recognition does
 * the work and the server is not involved.
 */
export interface STTProvider {
  id: string
  transcribe(audio: Blob, opts: { language: 'de' }): Promise<{ text: string; model: string }>
}

export type VoiceMode = { mode: 'browser' } | { mode: 'server'; testMode: boolean } | { mode: 'off'; reason: string }

export function voiceMode(): VoiceMode {
  const e = env()
  switch (e.STT_PROVIDER) {
    case 'browser':
      return { mode: 'browser' }
    case 'fake':
      return { mode: 'server', testMode: true }
    case 'openai':
      return e.OPENAI_API_KEY ? { mode: 'server', testMode: false } : { mode: 'off', reason: 'Die Spracheingabe ist noch nicht eingerichtet (Schlüssel für den Transkriptionsdienst fehlt).' }
    case 'none':
      return { mode: 'off', reason: 'Die Spracheingabe ist ausgeschaltet.' }
  }
}

export async function getSTTProvider(): Promise<STTProvider | null> {
  const e = env()
  if (e.STT_PROVIDER === 'fake') return (await import('./fake')).fakeSTT
  if (e.STT_PROVIDER === 'openai' && e.OPENAI_API_KEY) return (await import('./openai')).openaiSTT(e.OPENAI_API_KEY, e.STT_MODEL)
  return null
}
