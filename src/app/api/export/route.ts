import { NextResponse } from 'next/server'
import { getSession } from '@/server/auth/session'
import { exportOrganization } from '@/server/services/settings'
import { DomainError } from '@/server/action'
import { berlinDay } from '@/lib/format'
import { logger } from '@/server/logger'

/** Download of all organization data as JSON (owner/admin). */
export async function GET() {
  const session = await getSession()
  if (!session?.ctx || !session.organization) return NextResponse.json({ ok: false, message: 'Bitte melde dich an.' }, { status: 401 })
  try {
    const data = await exportOrganization(session.ctx, session.organization.role)
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="prorendo-export-${berlinDay()}.json"`,
        'cache-control': 'no-store',
      },
    })
  } catch (e) {
    if (e instanceof DomainError && e.code === 'forbidden') return NextResponse.json({ ok: false, message: e.message }, { status: 403 })
    logger.error('export.failed', { error: e instanceof Error ? e : String(e), userId: session.userId })
    return NextResponse.json({ ok: false, message: 'Der Export ist fehlgeschlagen.' }, { status: 500 })
  }
}
