import 'server-only'
import type { STTProvider } from './provider'

/** OpenAI transcription API (plain fetch, no SDK). Audio is sent for transcription only and not stored by ProRendo. */
export function openaiSTT(apiKey: string, model: string): STTProvider {
  return {
    id: 'openai',
    async transcribe(audio, { language }) {
      const form = new FormData()
      form.append('file', audio, 'diktat.webm')
      form.append('model', model)
      form.append('language', language)
      form.append('response_format', 'json')
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) throw new Error(`transcription failed: ${res.status}`)
      const json = (await res.json()) as { text?: unknown }
      return { text: typeof json.text === 'string' ? json.text.trim() : '', model }
    },
  }
}
