import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  const protectedPath = request.nextUrl.pathname.startsWith('/dashboard')
  if (protectedPath) response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  if (protectedPath && (claimsError || typeof userId !== 'string')) {
    const destination = request.nextUrl.clone()
    destination.pathname = '/login'
    destination.searchParams.set('next', request.nextUrl.pathname)
    const redirectResponse = NextResponse.redirect(destination)
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
    redirectResponse.headers.set('Cache-Control', 'private, no-store, max-age=0')
    return redirectResponse
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
