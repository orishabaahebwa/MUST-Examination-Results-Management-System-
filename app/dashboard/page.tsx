import { requireActiveProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, DashboardFrame, DataTable as Table, Empty, StatusBadge } from '@/app/components/portal-ui'
import {
  approveSubmission,
  createAssessment,
  createCatalogueRecord,
  createSupportTicket,
  publishSubmission,
  resubmitResults,
  reviewSubmission,
  saveBatchMarks,
  setUserAccess,
  submitResults,
} from './actions'

type Row = Record<string, unknown>
const text = (row: Row, key: string) => String(row[key] ?? '')
const list = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString() : '—'
const status = (value: unknown) => <StatusBadge value={value} />
const uid = (row: Row, key = 'id') => text(row, key)

async function read(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await query
  return { rows: list(data), error }
}

function OfferingLabel({ offering, courses, semesters }: { offering: Row; courses: Row[]; semesters: Row[] }) {
  const course = courses.find((item) => uid(item) === text(offering, 'course_id'))
  const semester = semesters.find((item) => uid(item) === text(offering, 'semester_id'))
  return <>{course ? text(course, 'code') + ' · ' + text(course, 'title') : 'Course'} / {semester ? text(semester, 'name') : 'Semester'} / {text(offering, 'group_name')}</>
}

function IdOptions({ items, label }: { items: Row[]; label: (item: Row) => string }) {
  return <>{items.map((item) => <option key={uid(item)} value={uid(item)}>{label(item)}</option>)}</>
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const [{ notice }, profile] = await Promise.all([searchParams, requireActiveProfile()])
  const supabase = await createClient()
  const isAdmin = profile.role === 'ADMIN'
  const [departmentResult, yearResult, semesterResult, courseResult, offeringResult, profileResult] = await Promise.all([
    read(supabase.from('departments').select('id,code,name').order('name')),
    read(supabase.from('academic_years').select('id,label,starts_on,ends_on,is_current').order('starts_on', { ascending: false })),
    read(supabase.from('semesters').select('id,academic_year_id,name,starts_on,ends_on,status').order('starts_on', { ascending: false })),
    read(supabase.from('courses').select('id,code,title,credit_units,department_id,level').order('code')),
    read(supabase.from('course_offerings').select('id,course_id,semester_id,group_name').order('created_at', { ascending: false })),
    isAdmin
      ? read(supabase.from('profiles').select('id,institutional_email,full_name,student_number,staff_number,department_id,role,account_status').order('full_name'))
      : Promise.resolve({ rows: [] as Row[], error: null }),
  ])
  const departments = departmentResult.rows
  const years = yearResult.rows
  const semesters = semesterResult.rows
  const courses = courseResult.rows
  const offerings = offeringResult.rows
  const profiles = profileResult.rows
  const assignmentQuery = isAdmin
    ? supabase.from('course_staff').select('id,offering_id,user_id,assignment_role,assigned_by')
    : supabase.from('course_staff').select('id,offering_id,user_id,assignment_role').eq('user_id', profile.id)
  const { rows: assignments, error: assignmentError } = await read(assignmentQuery)
  const offeringIds = isAdmin
    ? offerings.map((item) => uid(item))
    : [...new Set(assignments.map((item) => text(item, 'offering_id')))]

  const enrollmentQuery = isAdmin
    ? supabase.from('enrollments').select('id,offering_id,student_id,enrollment_status')
    : profile.role === 'STUDENT'
      ? supabase.from('enrollments').select('id,offering_id,student_id,enrollment_status').eq('student_id', profile.id)
      : offeringIds.length
        ? supabase.from('enrollments').select('id,offering_id,student_id,enrollment_status').in('offering_id', offeringIds)
        : null
  const assessmentQuery = offeringIds.length
    ? supabase.from('assessments').select('id,offering_id,title,assessment_type,maximum_mark,weight').in('offering_id', offeringIds)
    : null
  const submissionQuery = isAdmin
    ? supabase.from('result_submissions').select('id,offering_id,submitted_by,status,lecturer_note,reviewer_note,registrar_note,submitted_at,reviewed_at,approved_at,published_at').order('submitted_at', { ascending: false })
    : offeringIds.length
      ? supabase.from('result_submissions').select('id,offering_id,submitted_by,status,lecturer_note,reviewer_note,registrar_note,submitted_at,reviewed_at,approved_at,published_at').in('offering_id', offeringIds).order('submitted_at', { ascending: false })
      : null
  const [enrollmentResult, assessmentResult, submissionResult] = await Promise.all([
    enrollmentQuery ? read(enrollmentQuery) : Promise.resolve({ rows: [] as Row[], error: null }),
    assessmentQuery ? read(assessmentQuery) : Promise.resolve({ rows: [] as Row[], error: null }),
    submissionQuery ? read(submissionQuery) : Promise.resolve({ rows: [] as Row[], error: null }),
  ])
  const enrollments = enrollmentResult.rows
  const assessments = assessmentResult.rows
  const submissions = submissionResult.rows
  const assessmentIds = assessments.map((item) => uid(item))
  const marksResult = assessmentIds.length
    ? await read(supabase.from('marks').select('id,assessment_id,student_id,mark').in('assessment_id', assessmentIds))
    : { rows: [] as Row[], error: null }
  const marks = marksResult.rows

  const publishedQuery = profile.role === 'STUDENT'
    ? supabase.from('published_results').select('id,offering_id,student_id,total_mark,grade,publication_status,published_at').eq('student_id', profile.id).order('published_at', { ascending: false })
    : offeringIds.length
      ? supabase.from('published_results').select('id,offering_id,student_id,total_mark,grade,publication_status,published_at').in('offering_id', offeringIds).order('published_at', { ascending: false })
      : null
  const publishedResult = publishedQuery ? await read(publishedQuery) : { rows: [] as Row[], error: null }
  const ticketsResult = isAdmin
    ? await read(supabase.from('support_tickets').select('id,created_by,subject,message,status,created_at').order('created_at', { ascending: false }))
    : await read(supabase.from('support_tickets').select('id,created_by,subject,message,status,created_at').eq('created_by', profile.id).order('created_at', { ascending: false }))
  const auditResult = isAdmin
    ? await read(supabase.from('audit_logs').select('id,actor_id,action,entity_type,entity_id,details,created_at').order('created_at', { ascending: false }).limit(200))
    : { rows: [] as Row[], error: null }
  const reviewActions = submissions.length
    ? await read(supabase.from('review_actions').select('id,submission_id,actor_id,action,comments,created_at').in('submission_id', submissions.map((item) => uid(item))))
    : { rows: [] as Row[], error: null }

  const dashboardHasQueryErrors = [
    departmentResult.error, yearResult.error, semesterResult.error, courseResult.error,
    offeringResult.error, profileResult.error, assignmentError, enrollmentResult.error,
    assessmentResult.error, submissionResult.error, marksResult.error, publishedResult.error,
    ticketsResult.error, auditResult.error, reviewActions.error,
  ].some(Boolean)

  const myAssignments = assignments.filter((item) => text(item, 'user_id') === profile.id)
  const lecturerOfferingIds = myAssignments.filter((item) => text(item, 'assignment_role') === 'LECTURER').map((item) => text(item, 'offering_id'))
  const reviewerOfferingIds = myAssignments.filter((item) => text(item, 'assignment_role') === 'REVIEWER').map((item) => text(item, 'offering_id'))
  const registrarOfferingIds = myAssignments.filter((item) => text(item, 'assignment_role') === 'REGISTRAR').map((item) => text(item, 'offering_id'))
  const people = profiles.filter((item) => text(item, 'account_status') === 'ACTIVE')
  const students = people.filter((item) => text(item, 'role') === 'STUDENT')
  const studentName = (idValue: string) => {
    const found = profiles.find((item) => uid(item) === idValue)
    return found ? text(found, 'full_name') : idValue
  }
  const currentOffering = (idValue: string) => offerings.find((item) => uid(item) === idValue)
  const offeringText = (idValue: string) => {
    const found = currentOffering(idValue)
    return found ? <OfferingLabel offering={found} courses={courses} semesters={semesters} /> : idValue
  }
  const noticeText = notice ? <div className="notice">{notice}</div> : null

  return (
    <DashboardFrame profile={profile}>
        <main className="content" id="overview">
          <section className="welcome"><div><div className="kicker">{profile.role} WORKSPACE</div><h1>Welcome, {profile.full_name.split(' ')[0]}.</h1><p>Role-based examination services for Mbarara University of Science and Technology.</p></div><span className="tag">SECURE SESSION</span></section>
          {noticeText}
          {dashboardHasQueryErrors && <div className="notice error" role="alert">Some workspace information could not be loaded. Empty sections may be incomplete; refresh the page or contact support if the issue continues.</div>}
          <div className="demo-banner"><strong>Demonstration catalogue:</strong> current seeded catalogue entries are sample data. Confirm academic offerings and assignments before operational use.</div>
          <div className="stats">
            <div className="stat"><strong>{offerings.length}</strong><span>Course offerings visible</span></div>
            <div className="stat"><strong>{submissions.length}</strong><span>Submissions visible</span></div>
            <div className="stat"><strong>{publishedResult.rows.length}</strong><span>Published results visible</span></div>
            <div className="stat"><strong>{ticketsResult.rows.filter((ticket) => text(ticket, 'status') === 'OPEN').length}</strong><span>Open support requests</span></div>
          </div>

          <div className="grid">
            <Card id="catalogue" title="Course and semester catalogue" note="Catalogue reads are controlled by Supabase RLS.">
              {offerings.length ? <Table headings={['Course offering', 'Department', 'Semester', 'Academic year']}>
                {offerings.map((offering) => {
                  const course = courses.find((item) => uid(item) === text(offering, 'course_id'))
                  const semester = semesters.find((item) => uid(item) === text(offering, 'semester_id'))
                  const year = years.find((item) => uid(item) === text(item, 'id') && uid(item) === text(semester ?? {}, 'academic_year_id'))
                  const department = departments.find((item) => uid(item) === text(course ?? {}, 'department_id'))
                  return <tr key={uid(offering)}><td><OfferingLabel offering={offering} courses={courses} semesters={semesters} /></td><td>{text(department ?? {}, 'name') || '—'}</td><td>{text(semester ?? {}, 'status') || '—'}</td><td>{text(year ?? {}, 'label') || '—'}</td></tr>
                })}
              </Table> : <Empty>No catalogue offerings are available.</Empty>}
            </Card>

            {isAdmin && <Card title="Catalogue administration" note="Create the records that connect courses, semesters and users.">
              <div className="grid">
                <form action={createCatalogueRecord} className="card half"><input type="hidden" name="kind" value="department" /><h3>Department</h3><div className="field"><label>Code</label><input name="code" required maxLength={20} /></div><div className="field"><label>Name</label><input name="name" required maxLength={120} /></div><button>Save department</button></form>
                <form action={createCatalogueRecord} className="card half"><input type="hidden" name="kind" value="academic_year" /><h3>Academic year</h3><div className="field"><label>Label</label><input name="label" placeholder="YYYY/YYYY" required /></div><div className="form-grid"><div className="field"><label>Starts</label><input type="date" name="starts_on" required /></div><div className="field"><label>Ends</label><input type="date" name="ends_on" required /></div></div><button>Save year</button></form>
                <form action={createCatalogueRecord} className="card half"><input type="hidden" name="kind" value="semester" /><h3>Semester</h3><div className="field"><label>Academic year</label><select name="academic_year_id" required><option value="">Choose year</option><IdOptions items={years} label={(item) => text(item, 'label')} /></select></div><div className="form-grid"><div className="field"><label>Name</label><select name="name"><option>SEMESTER 1</option><option>SEMESTER 2</option><option>RECESS</option></select></div><div className="field"><label>Status</label><select name="status"><option>PLANNED</option><option>OPEN</option><option>CLOSED</option></select></div></div><div className="form-grid"><div className="field"><label>Starts</label><input type="date" name="starts_on" required /></div><div className="field"><label>Ends</label><input type="date" name="ends_on" required /></div></div><button>Save semester</button></form>
                <form action={createCatalogueRecord} className="card half"><input type="hidden" name="kind" value="course" /><h3>Course</h3><div className="form-grid"><div className="field"><label>Course code</label><input name="code" required /></div><div className="field"><label>Course title</label><input name="title" required /></div></div><div className="form-grid"><div className="field"><label>Department</label><select name="department_id" required><option value="">Choose department</option><IdOptions items={departments} label={(item) => text(item, 'name')} /></select></div><div className="field"><label>Credit units</label><input type="number" name="credit_units" min="1" max="30" defaultValue="3" required /></div></div><div className="field"><label>Level</label><input type="number" name="level" min="1" max="6" defaultValue="1" required /></div><button>Save course</button></form>
                <form action={createCatalogueRecord} className="card half"><input type="hidden" name="kind" value="offering" /><h3>Course offering</h3><div className="field"><label>Course</label><select name="course_id" required><option value="">Choose course</option><IdOptions items={courses} label={(item) => text(item, 'code') + ' · ' + text(item, 'title')} /></select></div><div className="field"><label>Semester</label><select name="semester_id" required><option value="">Choose semester</option><IdOptions items={semesters} label={(item) => text(item, 'name') + ' · ' + text(item, 'starts_on')} /></select></div><div className="field"><label>Group</label><input name="group_name" defaultValue="MAIN" /></div><button>Create offering</button></form>
                <form action={createCatalogueRecord} className="card half"><input type="hidden" name="kind" value="staff" /><h3>Assign course staff</h3><div className="field"><label>Offering</label><select name="offering_id" required><option value="">Choose offering</option>{offerings.map((item) => <option key={uid(item)} value={uid(item)}>{offeringText(uid(item))}</option>)}</select></div><div className="field"><label>Active staff account</label><select name="user_id" required><option value="">Choose account</option><IdOptions items={people.filter((item) => text(item, 'role') !== 'STUDENT')} label={(item) => text(item, 'full_name') + ' · ' + text(item, 'role')} /></select></div><div className="field"><label>Assignment role</label><select name="assignment_role"><option>LECTURER</option><option>REVIEWER</option><option>REGISTRAR</option></select></div><button>Assign staff</button></form>
                <form action={createCatalogueRecord} className="card half"><input type="hidden" name="kind" value="enrollment" /><h3>Enroll a student</h3><div className="field"><label>Offering</label><select name="offering_id" required><option value="">Choose offering</option>{offerings.map((item) => <option key={uid(item)} value={uid(item)}>{offeringText(uid(item))}</option>)}</select></div><div className="field"><label>Active student account</label><select name="student_id" required><option value="">Choose student</option><IdOptions items={students} label={(item) => text(item, 'full_name') + ' · ' + (text(item, 'student_number') || text(item, 'institutional_email'))} /></select></div><button>Enroll student</button></form>
              </div>
            </Card>}

            {isAdmin && <Card id="access" title="Account access administration" note="New users always arrive as pending students. Use this panel only after verifying a person's institutional status.">
              {profiles.length ? <Table headings={['User', 'Current access', 'Set access']}>{profiles.map((user) => <tr key={uid(user)}><td>{text(user, 'full_name')}<br /><small>{text(user, 'institutional_email')}</small></td><td>{text(user, 'role')} · {status(text(user, 'account_status'))}</td><td><form action={setUserAccess} className="form-grid"><input type="hidden" name="user_id" value={uid(user)} /><select aria-label="Role" name="role" defaultValue={text(user, 'role')}>{['STUDENT', 'LECTURER', 'REVIEWER', 'REGISTRAR', 'ADMIN'].map((role) => <option key={role}>{role}</option>)}</select><select aria-label="Status" name="account_status" defaultValue={text(user, 'account_status')}>{['PENDING', 'ACTIVE', 'SUSPENDED'].map((item) => <option key={item}>{item}</option>)}</select><button>Save access</button></form></td></tr>)}</Table> : <Empty>No user profiles yet.</Empty>}
            </Card>}

            {isAdmin && <Card title="Staff assignments and enrolments" note="Review course access and enrolled accounts before lecturers enter marks.">
              <h3>Assigned course staff</h3>
              {assignments.length ? <Table headings={['Offering', 'Staff member', 'Assignment']}>{assignments.map((assignment) => {
                const person = profiles.find((item) => uid(item) === text(assignment, 'user_id'))
                return <tr key={uid(assignment)}><td>{offeringText(text(assignment, 'offering_id'))}</td><td>{text(person ?? {}, 'full_name') || text(assignment, 'user_id')}</td><td>{text(assignment, 'assignment_role')}</td></tr>
              })}</Table> : <Empty>No staff are assigned yet.</Empty>}
              <h3 style={{marginTop:20}}>Enrolled students</h3>
              {enrollments.length ? <Table headings={['Offering', 'Student', 'Status']}>{enrollments.map((enrollment) => <tr key={uid(enrollment)}><td>{offeringText(text(enrollment, 'offering_id'))}</td><td>{studentName(text(enrollment, 'student_id'))}</td><td>{text(enrollment, 'enrollment_status')}</td></tr>)}</Table> : <Empty>No student enrolments are present.</Empty>}
            </Card>}

            {profile.role === 'LECTURER' && <Card id="assessments" title="Assessment setup" note="Configure assessment maximum marks and weights for an assigned offering. The database requires weights to total 100 percent before publication.">
              <form action={createAssessment} className="form-grid"><div className="field"><label>Assigned offering</label><select name="offering_id" required><option value="">Choose offering</option>{offerings.filter((item) => lecturerOfferingIds.includes(uid(item))).map((item) => <option key={uid(item)} value={uid(item)}>{offeringText(uid(item))}</option>)}</select></div><div className="field"><label>Assessment title</label><input name="title" required maxLength={120} /></div><div className="field"><label>Type</label><select name="assessment_type">{['COURSEWORK', 'TEST', 'PRACTICAL', 'EXAM'].map((item) => <option key={item}>{item}</option>)}</select></div><div className="field"><label>Maximum mark</label><input type="number" name="maximum_mark" min="0.01" max="100" step="0.01" required /></div><div className="field"><label>Weight (%)</label><input type="number" name="weight" min="0.01" max="100" step="0.01" required /></div><button>Create assessment</button></form>
              {assessments.filter((item) => lecturerOfferingIds.includes(text(item, 'offering_id'))).length > 0 && <Table headings={['Offering', 'Assessment', 'Maximum', 'Weight']}>{assessments.filter((item) => lecturerOfferingIds.includes(text(item, 'offering_id'))).map((item) => <tr key={uid(item)}><td>{offeringText(text(item, 'offering_id'))}</td><td>{text(item, 'title')}</td><td>{text(item, 'maximum_mark')}</td><td>{text(item, 'weight')}%</td></tr>)}</Table>}
            </Card>}

            {profile.role === 'LECTURER' && <Card id="marks" title="Batch mark entry" note="One row per enrolled student and assessment. Enter marks within each assessment maximum; RLS and the server validate the offering assignment. Student identifiers are shown because current RLS does not expose other students’ profile names to lecturers.">
              {lecturerOfferingIds.map((offeringId) => {
                const offerAssessments = assessments.filter((item) => text(item, 'offering_id') === offeringId)
                const offerStudents = enrollments.filter((item) => text(item, 'offering_id') === offeringId && text(item, 'enrollment_status') === 'ENROLLED')
                const submission = submissions.find((item) => text(item, 'offering_id') === offeringId)
                const existing = new Map(marks.map((item) => [text(item, 'assessment_id') + ':' + text(item, 'student_id'), text(item, 'mark')]))
                if (!offerAssessments.length || !offerStudents.length) return <div className="notice" key={offeringId}>{offeringText(offeringId)} needs assessments and enrolled students before mark entry.</div>
                return <div key={offeringId} style={{marginTop:20}}><h3><OfferingLabel offering={currentOffering(offeringId) ?? {}} courses={courses} semesters={semesters} /> {submission && <>{status(text(submission, 'status'))}</>}</h3>
                  {submission && text(submission, 'status') === 'RETURNED' && text(submission, 'reviewer_note') && <div className="notice error" role="status"><strong>Reviewer comments:</strong> {text(submission, 'reviewer_note')}</div>}
                  <form action={saveBatchMarks}>
                    <input type="hidden" name="offering_id" value={offeringId} />
                    <Table headings={['Enrolled student ID', ...offerAssessments.map((item) => text(item, 'title') + ' / ' + text(item, 'maximum_mark'))]}>
                      {offerStudents.map((student) => <tr key={uid(student, 'student_id')}><td><code>{text(student, 'student_id')}</code></td>{offerAssessments.map((assessment) => <td key={uid(assessment)}><input aria-label={text(assessment, 'title') + ' mark for student'} type="number" min="0" max={text(assessment, 'maximum_mark')} step="0.01" name={'mark-' + uid(assessment) + '-' + text(student, 'student_id')} defaultValue={existing.get(uid(assessment) + ':' + text(student, 'student_id')) ?? ''} disabled={Boolean(submission && text(submission, 'status') !== 'RETURNED')} /></td>)}</tr>)}
                    </Table>
                    {(!submission || text(submission, 'status') === 'RETURNED') && <div className="actions"><button type="submit">Save batch marks</button></div>}
                  </form>
                  {submission && text(submission, 'status') !== 'RETURNED' && <div className="notice">Marks are locked while this submission is under review, approved or published.</div>}
                  {!submission && <form action={submitResults} className="form-grid" style={{marginTop:12}}><input type="hidden" name="offering_id" value={offeringId} /><div className="field"><label>Lecturer note (optional)</label><input name="lecturer_note" maxLength={500} /></div><button>Submit complete results</button></form>}
                  {submission && text(submission, 'status') === 'RETURNED' && <form action={resubmitResults} className="form-grid" style={{marginTop:12}}><input type="hidden" name="submission_id" value={uid(submission)} /><div className="field"><label>Correction note</label><input name="lecturer_note" maxLength={500} required /></div><button>Resubmit corrected results</button></form>}
                </div>
              })}
              {!lecturerOfferingIds.length && <Empty>No lecturer offerings are assigned to your account.</Empty>}
            </Card>}

            {(profile.role === 'REVIEWER' || profile.role === 'REGISTRAR' || isAdmin) && <Card id="workflow" title={profile.role === 'REVIEWER' ? 'Reviewer queue' : profile.role === 'REGISTRAR' ? 'Registrar workflow' : 'Submission overview'} note="Actions are checked against your profile and course assignment, then authorized again by the database.">
              {submissions.length ? <Table headings={['Offering', 'Status', 'Submitted', 'Lecturer note', 'Reviewer comments', 'Action']}>
                {submissions.filter((item) => isAdmin ||
                  (profile.role === 'REVIEWER' && reviewerOfferingIds.includes(text(item, 'offering_id'))) ||
                  (profile.role === 'REGISTRAR' && registrarOfferingIds.includes(text(item, 'offering_id'))))
                  .map((submission) => {
                    const submissionAssessmentIds = assessments
                      .filter((item) => text(item, 'offering_id') === text(submission, 'offering_id'))
                      .map((item) => uid(item))
                    const submissionMarks = marks.filter((item) => submissionAssessmentIds.includes(text(item, 'assessment_id')))
                    return <tr key={uid(submission)}>
                    <td>{offeringText(text(submission, 'offering_id'))}<br /><small>{uid(submission)}</small></td>
                    <td>{status(text(submission, 'status'))}</td><td>{date(submission.submitted_at)}</td>
                    <td>{text(submission, 'lecturer_note') || '—'}</td><td>{text(submission, 'reviewer_note') || '—'}</td>
                    <td><details><summary>Review marks ({submissionMarks.length})</summary>
                      {submissionMarks.length ? <ul>{submissionMarks.map((item) => {
                        const assessment = assessments.find((candidate) => uid(candidate) === text(item, 'assessment_id'))
                        return <li key={uid(item)}>{studentName(text(item, 'student_id'))} · {text(assessment ?? {}, 'title')}: {text(item, 'mark')} / {text(assessment ?? {}, 'maximum_mark')}</li>
                      })}</ul> : <p>No marks are visible for this submission.</p>}
                    </details>
                    {profile.role === 'REVIEWER' && ['SUBMITTED', 'UNDER_REVIEW'].includes(text(submission, 'status')) && <form action={reviewSubmission}>
                      <input type="hidden" name="submission_id" value={uid(submission)} /><div className="field"><label>Review comment</label><input name="comments" maxLength={1000} placeholder="Required to return" /></div><div className="actions"><button name="action" value="REVIEWED">Review</button><button className="danger" name="action" value="RETURNED">Return</button></div>
                    </form>}
                    {profile.role === 'REGISTRAR' && text(submission, 'status') === 'UNDER_REVIEW' && <form action={approveSubmission}><input type="hidden" name="submission_id" value={uid(submission)} /><div className="field"><label>Registrar note</label><input name="comments" maxLength={1000} /></div><button>Approve results</button></form>}
                    {profile.role === 'REGISTRAR' && text(submission, 'status') === 'APPROVED' && <form action={publishSubmission}><input type="hidden" name="submission_id" value={uid(submission)} /><p className="subtle">Publishing calculates the official weighted totals and grades in PostgreSQL.</p><button>Publish results</button></form>}
                    {isAdmin && <small>Workflow action by the assigned reviewer or registrar.</small>}
                    </td>
                  </tr>
                  })}
              </Table> : <Empty>No assigned submissions are in the queue.</Empty>}
              {reviewActions.rows.length > 0 && <div style={{marginTop:18}}><h3>Recent review actions</h3><Table headings={['Action', 'Comments', 'Date']}>{reviewActions.rows.map((item) => <tr key={uid(item)}><td>{text(item, 'action')}</td><td>{text(item, 'comments') || '—'}</td><td>{date(item.created_at)}</td></tr>)}</Table></div>}
            </Card>}

            {profile.role === 'STUDENT' && <Card id="results" title="Published results" note="Only records published for your own authenticated profile are queried.">
              {publishedResult.rows.length ? <Table headings={['Course offering', 'Total mark', 'Grade', 'Published']}>{publishedResult.rows.map((item) => <tr key={uid(item)}><td>{offeringText(text(item, 'offering_id'))}</td><td>{text(item, 'total_mark')}</td><td><strong>{text(item, 'grade')}</strong></td><td>{date(item.published_at)}</td></tr>)}</Table> : <Empty>No published results are available for your account.</Empty>}
            </Card>}

            {['ADMIN', 'REGISTRAR', 'REVIEWER'].includes(profile.role) && <Card id="reports" title="Published results report" note="Official totals and grades are read from the database publication table.">
              {publishedResult.rows.length ? <Table headings={['Offering', 'Student', 'Total', 'Grade', 'Published']}>{publishedResult.rows.map((item) => <tr key={uid(item)}><td>{offeringText(text(item, 'offering_id'))}</td><td>{studentName(text(item, 'student_id'))}</td><td>{text(item, 'total_mark')}</td><td>{text(item, 'grade')}</td><td>{date(item.published_at)}</td></tr>)}</Table> : <Empty>No published results are available.</Empty>}
            </Card>}

            {isAdmin && <Card id="audit" title="Audit trail" note="The database policy limits audit-log reads to administrators.">
              {auditResult.rows.length ? <Table headings={['Date', 'Action', 'Record', 'Details']}>{auditResult.rows.map((item) => <tr key={uid(item)}><td>{date(item.created_at)}</td><td>{text(item, 'action')}</td><td>{text(item, 'entity_type')} {text(item, 'entity_id')}</td><td><code>{JSON.stringify(item.details ?? {})}</code></td></tr>)}</Table> : <Empty>No audit records are available.</Empty>}
            </Card>}

            <Card id="support" title="Help and support" note="Your ticket is visible to you and the administrator.">
              <form action={createSupportTicket} className="form-grid"><div className="field"><label>Subject</label><input name="subject" minLength={4} maxLength={160} required /></div><div className="field"><label>Message</label><textarea name="message" minLength={10} maxLength={4000} required /></div><button>Send support request</button></form>
              {ticketsResult.rows.length ? <Table headings={['Subject', 'Message', 'Status', 'Created']}>{ticketsResult.rows.map((ticket) => <tr key={uid(ticket)}><td>{text(ticket, 'subject')}</td><td>{text(ticket, 'message')}</td><td>{status(text(ticket, 'status'))}</td><td>{date(ticket.created_at)}</td></tr>)}</Table> : <Empty>No support requests yet.</Empty>}
            </Card>
          </div>
        </main>
    </DashboardFrame>
  )
}
