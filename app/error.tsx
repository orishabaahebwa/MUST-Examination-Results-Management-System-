'use client'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="route-error" role="alert">
    <span className="kicker">MUST EXAMINATION SERVICES</span>
    <h1>We could not load this page.</h1>
    <p>Your account and results were not changed. Try again, or return to sign in if the problem continues.</p>
    <div className="error-actions"><button type="button" onClick={() => reset()}>Try again</button><a className="button secondary" href="/login">Return to sign in</a></div>
    <a className="university-link" href="https://www.must.ac.ug/" target="_blank" rel="noopener noreferrer">MUST website</a>
  </main>
}
