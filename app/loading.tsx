export default function Loading() {
  return <main className="loading-screen" aria-live="polite" aria-busy="true">
    <div className="loading-brand"><span className="loading-mark" aria-hidden="true">MUST</span><span><strong>Mbarara University of Science and Technology</strong><small>Examination Results Management System</small></span></div>
    <div className="loading-line" />
    <p>Loading your secure workspace…</p>
  </main>
}
