import { NextResponse, type NextRequest } from 'next/server'
import { websiteInquiryInput } from '@/domain/schemas'
import { receiveWebsiteInquiry } from '@/server/services/inbound'
import { logger } from '@/server/logger'

// Public endpoint for the contact form on the landing page. No session: the
// origin allowlist, input limits, the honeypot and a per-IP limit keep it narrow.

const DEFAULT_ORIGINS = ['https://prorendo.de', 'https://www.prorendo.de']
const DEV_ORIGINS = ['http://localhost:4321', 'http://localhost:4322']
const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 5
const recent = new Map<string, number[]>()

function allowedOrigins(): string[] {
  const configured = process.env.LEAD_ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean)
  const list = configured?.length ? configured : DEFAULT_ORIGINS
  return process.env.NODE_ENV === 'production' ? list : [...list, ...DEV_ORIGINS]
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowedOrigins().includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** Best effort only: counts per server instance. */
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  hits.push(now)
  recent.set(ip, hits)
  if (recent.size > 5000) recent.clear()
  return hits.length > MAX_PER_WINDOW
}

export function OPTIONS(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'))
  return new NextResponse(null, { status: headers['Access-Control-Allow-Origin'] ? 204 : 403, headers })
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'))
  const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers })
  if (!headers['Access-Control-Allow-Origin']) return reply(403, { ok: false })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) return reply(429, { ok: false, message: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' })

  const parsed = websiteInquiryInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return reply(400, { ok: false, message: 'Bitte prüfen Sie Ihre Angaben.' })
  // Honeypot filled: answer like a success so bots learn nothing.
  if (parsed.data.website) return reply(200, { ok: true })

  try {
    const filed = await receiveWebsiteInquiry(parsed.data)
    if (!filed) {
      logger.error('inquiry.no_target_organization', {})
      return reply(503, { ok: false })
    }
    return reply(200, { ok: true })
  } catch (e) {
    logger.error('inquiry.failed', { error: e instanceof Error ? e : String(e) })
    return reply(500, { ok: false })
  }
}
