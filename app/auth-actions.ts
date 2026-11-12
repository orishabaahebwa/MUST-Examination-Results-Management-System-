'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isMustEmail } from '@/lib/validation.mjs'
import { safeAppPath } from '@/lib/redirects.mjs'

function note(path: string, value: string): never {
  redirect(path + '?notice=' + encodeURIComponent(value))
}

export async function register(formData: FormData) {
  const fullName = String(formData.get('full_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (fullName.length < 2 || fullName.length > 120) note('/register', 'Enter your name (2–120 characters).')
  if (!isMustEmail(email)) note('/register', 'Use your @must.ac.ug or @std.must.ac.ug email address.')
  if (password.length < 12) note('/register', 'Use a password with at least 12 characters.')

  const supabase = await createClient()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: origin + '/auth/callback?next=%2Fdashboard',
    },
  })
  if (error) note('/register', 'We could not create this account. Check your email and try again.')
  if (data.session) {
    await supabase.auth.signOut()
    note('/login', 'Email verification is required. Check your MUST inbox before signing in.')
  }
  note('/login', 'Check your MUST email to verify the account. New accounts remain pending until approved.')
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = safeAppPath(formData.get('next'))
  if (!isMustEmail(email) || !password) note('/login', 'Enter your MUST institutional email and password.')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) note('/login', 'Sign-in failed. Check your details and verify your email address.')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email_confirmed_at) {
    await supabase.auth.signOut()
    note('/login', 'Verify your MUST email before signing in.')
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  if (claimsError || !claims || typeof claims.sub !== 'string') {
    await supabase.auth.signOut()
    note('/login', 'Your session could not be verified. Try again.')
  }
  const userId = claims.sub

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_status')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.account_status === 'PENDING') redirect('/pending')
  if (profile?.account_status !== 'ACTIVE') {
    await supabase.auth.signOut()
    note('/login', 'This account is not active. Contact the examinations administrator.')
  }
  redirect(next)
}

export async function googleSignIn() {
  if (process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED !== 'true') {
    note('/login', 'Google sign-in is not configured for this project yet. Use your MUST email and password.')
  }
  const supabase = await createClient()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: origin + '/auth/callback?next=%2Fdashboard', queryParams: { prompt: 'select_account' } },
  })
  if (error || !data.url) note('/login', 'Google sign-in is unavailable. Use your MUST email and password.')
  redirect(data.url)
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login?notice=You%20have%20signed%20out.')
}
