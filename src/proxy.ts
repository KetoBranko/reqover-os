import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/anmelden', '/auth']

// Keeps the Supabase session cookie fresh and sends signed-out visitors to the
// login page. This is a convenience layer only: every page and action checks
// the session again on the server, and RLS checks it again in the database.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v))
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)
  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/anmelden'
    url.search = path === '/' ? '' : `?weiter=${encodeURIComponent(path)}`
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
}
