import Link from 'next/link'
import { register } from '@/app/auth-actions'
import { PortalFooter, PortalHeader } from '@/app/components/portal-ui'

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams
  return (
    <><PortalHeader nav /><main className="auth-wrap">
      <section className="auth-art"><div className="auth-brand-note">MUST EXAMINATION SERVICES</div><div><div className="kicker">STUDENT ACCOUNT REQUEST</div><h1>Start with a verified university email.</h1><p>Registration creates a pending student profile. Staff roles are assigned by an administrator.</p></div><a href="https://www.must.ac.ug/" target="_blank" rel="noreferrer">Visit MUST website ↗</a></section>
      <section className="auth-card-wrap"><div className="auth-card">
        <div className="kicker">CREATE ACCOUNT</div><h1>Student registration</h1><p className="muted">Only @must.ac.ug and @std.must.ac.ug addresses are accepted.</p>
        {notice && <div className="notice error">{notice}</div>}
        <form action={register}>
          <div className="field"><label htmlFor="full_name">Full name</label><input id="full_name" name="full_name" autoComplete="name" minLength={2} maxLength={120} required /></div>
          <div className="field"><label htmlFor="email">MUST email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required /><small className="subtle">Use at least 12 characters.</small></div>
          <button type="submit">Request student account</button>
        </form>
        <p className="auth-foot">Already registered? <Link href="/login">Sign in</Link>. Accounts require email verification and administrator approval.</p>
      </div></section>
    </main><PortalFooter /></>
  )
}
