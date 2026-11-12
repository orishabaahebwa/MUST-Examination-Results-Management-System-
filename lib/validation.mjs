export function isMustEmail(value) {
  const email = String(value ?? '').trim().toLowerCase()
  return /^[a-z0-9._%+-]+@(?:std\.)?must\.ac\.ug$/.test(email)
}

export function validateBatchMarks(rows, assessments, enrolledStudentIds) {
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'Enter at least one mark.' }
  const assessmentMap = new Map(assessments.map((item) => [item.id, Number(item.maximum_mark)]))
  const enrolled = new Set(enrolledStudentIds)
  const seen = new Set()
  const normalized = []

  for (const row of rows) {
    const assessmentId = String(row?.assessment_id ?? '')
    const studentId = String(row?.student_id ?? '')
    const mark = Number(row?.mark)
    const maximum = assessmentMap.get(assessmentId)
    if (!assessmentMap.has(assessmentId)) return { error: 'A mark references an unknown assessment.' }
    if (!enrolled.has(studentId)) return { error: 'Every student must be actively enrolled in this course offering.' }
    if (!Number.isFinite(mark) || mark < 0 || mark > maximum) {
      return { error: 'Marks must be between 0 and the assessment maximum (' + maximum + ').' }
    }
    const key = assessmentId + ':' + studentId
    if (seen.has(key)) return { error: 'A student can have only one row per assessment in this batch.' }
    seen.add(key)
    normalized.push({ assessment_id: assessmentId, student_id: studentId, mark })
  }
  return { data: normalized }
}

export function hasRole(profile, allowed) {
  return Boolean(profile && profile.account_status === 'ACTIVE' && allowed.includes(profile.role))
}
