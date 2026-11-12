import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AppRole = 'ADMIN' | 'LECTURER' | 'REVIEWER' | 'REGISTRAR' | 'STUDENT'
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

export type Profile = {
  id: string
  institutional_email: string
  full_name: string
  student_number: string | null
  staff_number: string | null
  department_id: string | null
  role: AppRole
  account_status: AccountStatus
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  const userId = claims?.sub
  if (claimsError || typeof userId !== 'string') return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id,institutional_email,full_name,student_number,staff_number,department_id,role,account_status')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null
  return data as Profile
}

export async function requireActiveProfile(roles?: AppRole[]) {
  const profile = await getProfile()
  if (!profile) redirect('/login?notice=Please%20sign%20in%20again.')
  if (profile.account_status === 'PENDING') redirect('/pending')
  if (profile.account_status !== 'ACTIVE') redirect('/login?notice=This%20account%20is%20not%20active.')
  if (roles && !roles.includes(profile.role)) redirect('/dashboard?notice=You%20do%20not%20have%20access%20to%20that%20action.')
  return profile
}
