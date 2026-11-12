import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isMustEmail, hasRole, validateBatchMarks } from '../lib/validation.mjs'
import { safeAppPath } from '../lib/redirects.mjs'
import { getStatusAppearance } from '../lib/status.mjs'

test('status badges use explicit status mappings and keep unknown values neutral', () => {
  const expected = [
    ['PENDING', 'Pending', 'warning'],
    ['ACTIVE', 'Active', 'success'],
    ['INACTIVE', 'Inactive', 'neutral'],
    ['DRAFT', 'Draft', 'neutral'],
    ['SUBMITTED', 'Submitted', 'info'],
    ['UNDER_REVIEW', 'Under Review', 'warning'],
    ['RETURNED', 'Returned', 'warning'],
    ['APPROVED', 'Approved', 'success'],
    ['REJECTED', 'Rejected', 'danger'],
    ['PUBLISHED', 'Published', 'success'],
    ['UNPUBLISHED', 'Unpublished', 'neutral'],
    ['COMPLETED', 'Completed', 'success'],
    ['FAILED', 'Failed', 'danger'],
    ['SUSPENDED', 'Suspended', 'danger'],
  ]
  for (const [value, label, tone] of expected) {
    assert.deepEqual(getStatusAppearance(value), { label, tone })
  }
  assert.deepEqual(getStatusAppearance('IN_PROGRESS'), { label: 'In Progress', tone: 'warning' })
  assert.deepEqual(getStatusAppearance(true), { label: 'Active', tone: 'success' })
  assert.deepEqual(getStatusAppearance(false), { label: 'Inactive', tone: 'neutral' })
  assert.deepEqual(getStatusAppearance('A_NEW_DATABASE_STATE'), { label: 'A New Database State', tone: 'neutral' })
  assert.deepEqual(getStatusAppearance(null), { label: 'Unknown', tone: 'neutral' })
})

test('institutional email policy matches the existing MUST signup trigger', () => {
  assert.equal(isMustEmail('person@must.ac.ug'), true)
  assert.equal(isMustEmail('person@std.must.ac.ug'), true)
  assert.equal(isMustEmail('PERSON@MUST.AC.UG'), true)
  assert.equal(isMustEmail('person@gmail.com'), false)
  assert.equal(isMustEmail('person@must.test'), false)
  assert.equal(isMustEmail('must.ac.ug.attacker.test'), false)
})

test('authentication redirects accept safe application paths and reject external destinations', () => {
  assert.equal(safeAppPath('/dashboard?notice=done'), '/dashboard?notice=done')
  assert.equal(safeAppPath('/dashboard#results'), '/dashboard#results')
  assert.equal(safeAppPath('//evil.example/path'), '/dashboard')
  assert.equal(safeAppPath('/\\evil.example/path'), '/dashboard')
  assert.equal(safeAppPath('https://evil.example/path'), '/dashboard')
  assert.equal(safeAppPath('dashboard'), '/dashboard')
})

test('role permission helper requires an active profile and an allowed role', () => {
  assert.equal(hasRole({ role: 'LECTURER', account_status: 'ACTIVE' }, ['LECTURER']), true)
  assert.equal(hasRole({ role: 'STUDENT', account_status: 'ACTIVE' }, ['ADMIN']), false)
  assert.equal(hasRole({ role: 'ADMIN', account_status: 'PENDING' }, ['ADMIN']), false)
  assert.equal(hasRole({ role: 'ADMIN', account_status: 'SUSPENDED' }, ['ADMIN']), false)
})

test('batch mark validation enforces maximums, enrolment and unique student-assessment pairs', () => {
  const assessments = [{ id: 'assessment-a', maximum_mark: 40 }, { id: 'assessment-b', maximum_mark: 60 }]
  const enrolled = ['student-a', 'student-b']
  const valid = validateBatchMarks([
    { assessment_id: 'assessment-a', student_id: 'student-a', mark: 39.5 },
    { assessment_id: 'assessment-b', student_id: 'student-a', mark: 50 },
  ], assessments, enrolled)
  assert.equal(valid.error, undefined)
  assert.equal(valid.data.length, 2)
  assert.match(validateBatchMarks([{ assessment_id: 'assessment-a', student_id: 'student-a', mark: 41 }], assessments, enrolled).error, /maximum/)
  assert.match(validateBatchMarks([{ assessment_id: 'assessment-a', student_id: 'other-student', mark: 20 }], assessments, enrolled).error, /enrolled/)
  assert.match(validateBatchMarks([
    { assessment_id: 'assessment-a', student_id: 'student-a', mark: 20 },
    { assessment_id: 'assessment-a', student_id: 'student-a', mark: 22 },
  ], assessments, enrolled).error, /one row/)
  assert.ok(validateBatchMarks([], assessments, enrolled).error)
})

test('server contract uses verified claims, role gates, workflow RPCs and student ownership filters', async () => {
  const [authActions, auth, proxy, actions, dashboard, browserClient] = await Promise.all([
    readFile(new URL('../app/auth-actions.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/auth.ts', import.meta.url), 'utf8'),
    readFile(new URL('../proxy.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/dashboard/actions.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/dashboard/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/supabase/client.ts', import.meta.url), 'utf8'),
  ])
  assert.match(auth, /auth\.getClaims\(\)/)
  assert.match(proxy, /auth\.getClaims\(\)/)
  assert.doesNotMatch(authActions + auth + proxy + actions + dashboard + browserClient, /auth\.getSession\(\)|localStorage/)
  assert.match(authActions, /emailRedirectTo/)
  assert.match(authActions, /email_confirmed_at/)
  assert.match(authActions, /data: \{ full_name: fullName \}/)
  assert.doesNotMatch(authActions, /data: \{[^}]*role:/)
  assert.doesNotMatch(authActions + auth + proxy + actions + dashboard + browserClient, /service_role|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/)
  assert.match(actions, /requireActiveProfile\(allowed\)/)
  for (const rpc of ['review_result_submission', 'resubmit_returned_results', 'publish_approved_results', 'admin_set_user_access']) {
    assert.match(actions, new RegExp(rpc))
  }
  assert.match(dashboard, /\.eq\('student_id', profile\.id\)/)
  assert.match(actions, /validateBatchMarks/)
  assert.match(actions, /account_status !== 'ACTIVE'/)
  assert.match(actions, /submission\.status !== 'UNDER_REVIEW'/)
  assert.match(actions, /submission\.status !== 'APPROVED'/)
})

test('repository ignore rules cover local credentials, backups and frontend snapshots', async () => {
  const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8')
  for (const rule of ['.env', '.env.*', '!.env.example', 'node_modules/', '.next/', '.vercel/', 'backups/', 'frontend_backup_*/', 'frontend/*.before-*', 'frontend/*.backup.*', '*.dump', '*.backup.sql']) {
    assert.ok(ignore.split(/\r?\n/).includes(rule), 'Missing ignore rule: ' + rule)
  }
})

test('review, approval and publication actions use the existing stateful database RPCs', async () => {
  const actions = await readFile(new URL('../app/dashboard/actions.ts', import.meta.url), 'utf8')
  assert.match(actions, /actor\(\['REVIEWER'\]\)/)
  assert.match(actions, /actor\(\['REGISTRAR'\]\)/)
  assert.match(actions, /submission\.status !== 'UNDER_REVIEW'/)
  assert.match(actions, /submission\.status !== 'APPROVED'/)
  assert.match(actions, /p_action: action/)
  assert.match(actions, /p_action: 'APPROVED'/)
  assert.match(actions, /publish_approved_results/)
  assert.doesNotMatch(actions, /grade\s*=\s*.*(?:80|70|60|50)/)
})

test('hardened write permissions are respected by dashboard actions', async () => {
  const [actions, dashboard] = await Promise.all([
    readFile(new URL('../app/dashboard/actions.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/dashboard/page.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(actions, /\.upsert\(insertPayload, \{ onConflict: 'assessment_id,student_id', ignoreDuplicates: true \}\)/)
  assert.match(actions, /assessment_id, student_id, mark, entered_by: profile\.id/)
  assert.match(actions, /\.update\(\{ mark: mark\.mark, updated_by: profile\.id \}\)/)
  assert.doesNotMatch(actions, /\.from\('audit_logs'\)\.insert/)
  assert.doesNotMatch(actions, /\.from\('support_tickets'\)\.update/)
  assert.match(actions, /\.from\('support_tickets'\)\.insert\(\{ created_by: profile\.id, subject, message \}\)/)
  assert.match(actions, /p_submission_id: submissionId, p_action: 'APPROVED'/)
  assert.match(actions, /publish_approved_results/)
  assert.match(dashboard, /status\(text\(ticket, 'status'\)\)/)
  assert.doesNotMatch(dashboard, /updateSupportTicket/)
})

test('student results are read only for the authenticated profile', async () => {
  const dashboard = await readFile(new URL('../app/dashboard/page.tsx', import.meta.url), 'utf8')
  assert.match(dashboard, /profile\.role === 'STUDENT'[\s\S]*?published_results[\s\S]*?\.eq\('student_id', profile\.id\)/)
  assert.match(dashboard, /Reviewer comments:/)
  assert.match(dashboard, /Marks are locked while this submission is under review/)
})

test('shared MUST presentation keeps role navigation, mobile navigation and workflow sections', async () => {
  const [ui, styles, dashboard, authPage, loading, errorPage] = await Promise.all([
    readFile(new URL('../app/components/portal-ui.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/dashboard/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/loading.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/error.tsx', import.meta.url), 'utf8'),
  ])
  for (const token of ['--must-navy: #142D68', '--must-blue: #244B9B', '--must-dark: #0D204D', '--must-gold: #FCB900', '--background: #F5F7FB', '--surface: #FFFFFF', '--text: #263247', '--muted: #687386', '--border: #E0E5ED']) {
    assert.ok(styles.includes(token), `Missing MUST design token: ${token}`)
  }
  assert.match(ui, /aria-label="Workspace navigation"/)
  assert.match(ui, /aria-label="Mobile workspace navigation"/)
  assert.match(ui, /getStatusAppearance/)
  assert.ok(ui.includes("aria-label={'Status: ' + label}"))
  assert.match(ui, /profile\.role === 'LECTURER'.*Assessment setup/s)
  for (const section of ['catalogue', 'assessments', 'marks', 'workflow', 'results', 'reports', 'audit', 'support']) {
    assert.match(dashboard, new RegExp(`id="${section}"`))
  }
  assert.match(authPage, /PortalHeader nav/)
  assert.match(loading, /aria-busy="true"/)
  assert.match(errorPage, /role="alert"/)
  assert.match(dashboard, /Some workspace information could not be loaded/)
  assert.match(dashboard, /dashboardStats/)
  assert.match(dashboard, /publication_status/)
  assert.match(dashboard, /enrollment_status/)
  assert.match(ui, /https:\/\/www\.must\.ac\.ug\//)
  assert.match(styles, /@media\(max-width:900px\)/)
  assert.match(styles, /@media\(max-width:480px\)/)
  assert.match(styles, /@media\(max-width:360px\)/)
  assert.match(styles, /overflow-x:auto/)
  assert.match(styles, /prefers-reduced-motion:reduce/)
})
