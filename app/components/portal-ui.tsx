import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Profile } from '@/lib/auth'
import { logout } from '@/app/auth-actions'

export function MustBrand({ subtitle = 'Examination Results Management System' }: { subtitle?: string }) {
  return <Link className="brand" href="/" aria-label="Mbarara University of Science and Technology home">
    <span className="brand-mark" aria-hidden="true">MUST</span>
    <span className="brand-text"><strong>Mbarara University of Science and Technology</strong><small>{subtitle}</small></span>
  </Link>
}

export function PortalHeader({ nav = false }: { nav?: boolean }) {
  return <header className="site-header"><MustBrand />{nav && <nav className="main-nav" aria-label="Main navigation">
    <Link href="/login">Sign in</Link><Link href="/register">Student registration</Link>
    <a href="https://www.must.ac.ug/" target="_blank" rel="noopener noreferrer">University website</a>
  </nav>}</header>
}

export function PortalFooter() {
  return <footer className="site-footer"><strong>Mbarara University of Science and Technology</strong><span>Secure examination services</span><a href="https://www.must.ac.ug/" target="_blank" rel="noopener noreferrer">must.ac.ug</a></footer>
}

export function DashboardFrame({ profile, children }: { profile: Profile; children: ReactNode }) {
  const initials = profile.full_name.trim().split(/\s+/).map((word) => word[0]).slice(0, 2).join('').toUpperCase()
  return <div className="dashboard-shell">
    <aside className="sidebar">
      <MustBrand subtitle="Examination Services" />
      <div className="side-label">{profile.role} WORKSPACE</div>
      <nav className="side-nav" aria-label="Workspace navigation">
        <a href="#overview">Overview</a><a href="#catalogue">Course catalogue</a>
        {profile.role === 'LECTURER' && <><a href="#assessments">Assessment setup</a><a href="#marks">Batch marks</a></>}
        {['REVIEWER', 'REGISTRAR', 'ADMIN'].includes(profile.role) && <a href="#workflow">Results workflow</a>}
        {profile.role === 'STUDENT' && <a href="#results">Published results</a>}
        {['ADMIN', 'REGISTRAR', 'REVIEWER'].includes(profile.role) && <a href="#reports">Reports</a>}
        {profile.role === 'ADMIN' && <><a href="#access">Account access</a><a href="#audit">Audit trail</a></>}
        <a href="#support">Help and support</a>
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card"><strong>Need assistance?</strong><p>Contact your examinations coordinator for account and workflow support.</p><a href="https://www.must.ac.ug/" target="_blank" rel="noopener noreferrer">Visit MUST website →</a></div>
        <div className="sidebar-user"><span>{profile.institutional_email}</span><small>{profile.role} · {profile.account_status}</small></div>
        <form action={logout}><button className="button secondary signout" type="submit">Sign out</button></form>
      </div>
    </aside>
    <div className="dashboard-main">
      <header className="topbar"><div className="mobile-brand"><MustBrand subtitle="Examination Services" /></div><div className="topbar-title"><span className="crumb">MUST / {profile.role} workspace</span><strong>Examination Results Management System</strong></div><div className="userbar"><span className="avatar" aria-hidden="true">{initials}</span><span>{profile.full_name}<small>{profile.role}</small></span></div></header>
      <div className="mobile-nav"><details><summary>Workspace menu</summary><nav aria-label="Mobile workspace navigation"><a href="#overview">Overview</a><a href="#catalogue">Course catalogue</a>{profile.role === 'LECTURER' && <><a href="#assessments">Assessment setup</a><a href="#marks">Batch marks</a></>}{['REVIEWER','REGISTRAR','ADMIN'].includes(profile.role) && <a href="#workflow">Results workflow</a>}{profile.role === 'STUDENT' && <a href="#results">Published results</a>}<a href="#support">Help and support</a></nav></details></div>
      {children}
      <PortalFooter />
    </div>
  </div>
}

export function Card({ id, title, note, children }: { id?: string; title: string; note?: string; children: ReactNode }) {
  return <section className="card" id={id}><div className="card-head"><div><h2>{title}</h2>{note && <p className="subtle">{note}</p>}</div></div>{children}</section>
}

export function Empty({ children = 'No records are available for this account yet.' }: { children?: ReactNode }) { return <div className="empty">{children}</div> }

export function DataTable({ headings, children }: { headings: string[]; children: ReactNode }) {
  return <div className="table-wrap" role="region" aria-label="Results table" tabIndex={0}><table><thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}

export function StatusBadge({ value }: { value: unknown }) {
  const label = String(value ?? '—')
  return <span className={'status status-' + label.toLowerCase()}>{label.replaceAll('_', ' ')}</span>
}
