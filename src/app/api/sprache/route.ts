import { NextResponse, type NextRequest } from 'next/server'
import { getSession } from '@/server/auth/session'
import { getSTTProvider } from '@/server/stt/provider'
import { logger } from '@/server/logger'
import { hitLimit } from '@/server/rate-limit'

const MAX_BYTES = 15 * 1024 * 1024

function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status })
}

/**
 * Transcribes one dictation. The audio is passed to the configured provider
 * and discarded; ProRendo stores only the text the user then keeps.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) return fail(403, 'Anfrage nicht erlaubt.')
  const session = await getSession()
  if (!session?.ctx) return fail(401, 'Bitte melde dich an.')
  const provider = await getSTTProvider()
  if (!provider) return fail(503, 'Die Spracheingabe über den Server ist nicht eingerichtet.')
  if (hitLimit(`stt:${session.userId}`, 20)) return fail(429, 'Zu viele Diktate in kurzer Zeit. Bitte kurz warten.')

  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) return fail(413, 'Das Diktat ist zu lang. Bitte in kürzeren Abschnitten diktieren.')
  const form = await request.formData().catch(() => null)
  const audio = form?.get('audio')
  if (!(audio instanceof Blob) || audio.size === 0) return fail(400, 'Es wurde keine Aufnahme empfangen.')
  if (audio.size > MAX_BYTES) return fail(413, 'Das Diktat ist zu lang. Bitte in kürzeren Abschnitten diktieren.')
  if (audio.type && !audio.type.startsWith('audio/')) return fail(415, 'Unbekanntes Audioformat.')

  try {
    const { text } = await provider.transcribe(audio, { language: 'de' })
    logger.info('stt.transcribed', { provider: provider.id, bytes: audio.size, chars: text.length })
    return NextResponse.json({ ok: true, text })
  } catch (e) {
    logger.warn('stt.failed', { provider: provider.id, error: e instanceof Error ? e : String(e) })
    return fail(502, 'Die Umwandlung in Text ist fehlgeschlagen. Bitte noch einmal versuchen oder tippen.')
  }
}
