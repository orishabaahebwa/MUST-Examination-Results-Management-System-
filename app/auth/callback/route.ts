import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeAppPath } from '@/lib/redirects.mjs'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const destination = safeAppPath(request.nextUrl.searchParams.get('next'))
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(destination, request.url))
  }
  return NextResponse.redirect(new URL('/login?notice=Email%20verification%20could%20not%20be%20completed.%20Request%20a%20new%20link.', request.url))
}
