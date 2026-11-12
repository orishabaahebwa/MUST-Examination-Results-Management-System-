import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { PortalFooter, PortalHeader } from '@/app/components/portal-ui'

export default async function HomePage() {
  const profile = await getProfile()
  if (profile?.account_status === 'ACTIVE') redirect('/dashboard')
  if (profile?.account_status === 'PENDING') redirect('/pending')

  return (
    <><PortalHeader nav /><main className="auth-wrap">
      <section className="auth-art">
        <div className="auth-brand-note">MUST EXAMINATION SERVICES</div>
        <div><div className="kicker">ACADEMIC SERVICES · DIGITAL CAMPUS</div><h1>Excellence in every result.</h1><p>A secure workflow for submitting, reviewing, approving and publishing examination results.</p></div>
        <p>MBARARA UNIVERSITY OF SCIENCE AND TECHNOLOGY</p>
      </section>
      <section className="auth-card-wrap"><div className="auth-card">
        <div className="kicker">WELCOME</div><h1>Examination results, managed with care.</h1>
        <p className="muted">Sign in with your MUST institutional account. New accounts require verification and staff approval.</p>
        <Link className="button" href="/login">Sign in</Link>
        <div style={{height:12}} />
        <Link className="button secondary" href="/register">Create student account</Link>
        <p className="auth-foot">Need help? Contact your examinations coordinator or visit <a href="https://www.must.ac.ug/" target="_blank" rel="noreferrer">must.ac.ug</a>.</p>
      </div></section>
    </main><PortalFooter /></>
  )
}
