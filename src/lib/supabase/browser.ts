'use client'

import { createBrowserClient } from '@supabase/ssr'

// Browser client: only used for sign-in/sign-out. All data access is server-side.
export function supabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}
