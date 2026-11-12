import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { logout } from '@/app/auth-actions'
import { PortalFooter, PortalHeader, StatusBadge } from '@/app/components/portal-ui'

export default async function PendingPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.account_status === 'ACTIVE') redirect('/dashboard')
  if (profile.account_status === 'SUSPENDED') redirect('/login?notice=This%20account%20is%20suspended.')

  return (
    <><PortalHeader nav /><main className="auth-wrap">
      <section className="auth-art"><div className="auth-brand-note">MUST EXAMINATION SERVICES</div><div><div className="kicker">ACCOUNT REVIEW</div><h1>Your request is with the university team.</h1><p>New accounts start with student access pending approval. No privileged role is assigned during registration.</p></div><a href="https://www.must.ac.ug/" target="_blank" rel="noreferrer">Visit MUST website ↗</a></section>
      <section className="auth-card-wrap"><div className="auth-card"><StatusBadge value={profile.account_status} /><h1>Waiting for approval</h1><p>New accounts receive student access after administrator approval. Verify your institutional email to complete registration.</p><p className="subtle">Signed in as {profile.institutional_email}</p><form action={logout}><button className="secondary" type="submit">Sign out</button></form></div></section>
    </main><PortalFooter /></>
  )
}
