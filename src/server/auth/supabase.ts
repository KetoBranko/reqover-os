import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from '@/server/env'

/** Per-request Supabase client bound to the auth cookies. */
export async function supabaseServer() {
  const store = await cookies()
  return createServerClient(env().NEXT_PUBLIC_SUPABASE_URL, env().NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // Server Components cannot set cookies; the proxy refreshes the session instead.
        }
      },
    },
  })
}
