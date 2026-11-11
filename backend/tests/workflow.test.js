require('dotenv').config();
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');
const db = require('../db');

const fixture = {};
const demoPassword = process.env.LEGACY_DEMO_PASSWORD;

after(async () => {
  try {
    if (fixture.submissionId) {
      await db.execute('DELETE FROM audit_logs WHERE submission_id=?', [fixture.submissionId]);
      await db.execute('DELETE FROM marks WHERE submission_id=?', [fixture.submissionId]);
      await db.execute('DELETE FROM submissions WHERE id=?', [fixture.submissionId]);
    }
    if (fixture.assignmentId) await db.execute('DELETE FROM lecturer_assignments WHERE id=?', [fixture.assignmentId]);
    if (fixture.courseId) await db.execute('DELETE FROM courses WHERE id=?', [fixture.courseId]);
    if (fixture.semesterId) await db.execute('DELETE FROM semesters WHERE id=?', [fixture.semesterId]);
  } finally {
    await db.end();
  }
});

async function login(email, password) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.token;
}

test('MUST results workflow and access-control integration', async t => {
  assert.ok(demoPassword && demoPassword.length >= 12, 'Set LEGACY_DEMO_PASSWORD to the password used when seeding the legacy test database');
  const lecturerToken = await login('lecturer@must.test', demoPassword);
  const reviewerToken = await login('reviewer@must.test', demoPassword);
  const approverToken = await login('registrar@must.test', demoPassword);
  const studentToken = await login('student@must.test', demoPassword);
  const adminToken = await login('admin@must.test', demoPassword);

  const [[lecturer]] = await db.execute('SELECT id FROM users WHERE email=?', ['lecturer@must.test']);
  const [[student]] = await db.execute('SELECT student_id FROM users WHERE email=?', ['student@must.test']);
  assert.ok(lecturer?.id, 'Seed the lecturer account before running tests');
  assert.ok(student?.student_id, 'Seed the student account before running tests');

  const stamp = `${Date.now()}${process.pid}`;
  const courseCode = `TST${stamp}`.slice(0, 30);
  const semesterName = `Automated ${stamp}`.slice(0, 60);
  const academicYear = `2099/${String(process.pid).slice(-5)}`;

  const [course] = await db.execute('INSERT INTO courses(code,title) VALUES(?,?)', [courseCode, 'Automated workflow test course']);
  fixture.courseId = course.insertId;
  const [semester] = await db.execute('INSERT INTO semesters(name,academic_year) VALUES(?,?)', [semesterName, academicYear]);
  fixture.semesterId = semester.insertId;
  const [assignment] = await db.execute(
    'INSERT INTO lecturer_assignments(lecturer_id,course_id,semester_id) VALUES(?,?,?)',
    [lecturer.id, fixture.courseId, fixture.semesterId]
  );
  fixture.assignmentId = assignment.insertId;

  await t.test('rejects unauthenticated API requests', async () => {
    const response = await request(app).get('/api/results');
    assert.equal(response.status, 401);
  });

  await t.test('rejects invalid login credentials', async () => {
    const response = await request(app).post('/api/auth/login')
      .send({ email: 'lecturer@must.test', password: 'TEST_ONLY_NOT_A_REAL_PASSWORD_123!' });
    assert.equal(response.status, 401);
  });

  await t.test('serves the academic semester list to authenticated users', async () => {
    const response = await request(app).get('/api/semesters').set('Authorization', `Bearer ${lecturerToken}`);
    assert.equal(response.status, 200);
    assert.ok(response.body.semesters.some(item => item.id === fixture.semesterId));
  });

  await t.test('returns lecturer-assigned courses and available students', async () => {
    const courses = await request(app).get('/api/courses').set('Authorization', `Bearer ${lecturerToken}`);
    const students = await request(app).get('/api/students').set('Authorization', `Bearer ${lecturerToken}`);
    assert.equal(courses.status, 200);
    assert.ok(courses.body.courses.some(item => item.id === fixture.courseId));
    assert.equal(students.status, 200);
    assert.ok(students.body.students.some(item => item.id === student.student_id));
  });

  await t.test('blocks lecturers from performing reviewer actions', async () => {
    const response = await request(app).patch('/api/results/1/verify')
      .set('Authorization', `Bearer ${lecturerToken}`).send({ decision: 'VERIFY' });
    assert.equal(response.status, 403);
  });

  const submission = await request(app).post('/api/results')
    .set('Authorization', `Bearer ${lecturerToken}`)
    .send({ courseId: fixture.courseId, semesterId: fixture.semesterId,
      marks: [{ studentId: student.student_id, score: 78 }] });
  assert.equal(submission.status, 201, JSON.stringify(submission.body));
  fixture.submissionId = submission.body.submissionId;

  await t.test('prevents duplicate course-semester submissions', async () => {
    const response = await request(app).post('/api/results')
      .set('Authorization', `Bearer ${lecturerToken}`)
      .send({ courseId: fixture.courseId, semesterId: fixture.semesterId,
        marks: [{ studentId: student.student_id, score: 78 }] });
    assert.equal(response.status, 409);
  });

  await t.test('requires a reason when a reviewer returns marks', async () => {
    const response = await request(app).patch(`/api/results/${fixture.submissionId}/verify`)
      .set('Authorization', `Bearer ${reviewerToken}`).send({ decision: 'RETURN' });
    assert.equal(response.status, 422);
  });

  const verified = await request(app).patch(`/api/results/${fixture.submissionId}/verify`)
    .set('Authorization', `Bearer ${reviewerToken}`).send({ decision: 'VERIFY' });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.status, 'VERIFIED');

  const approved = await request(app).patch(`/api/results/${fixture.submissionId}/approve`)
    .set('Authorization', `Bearer ${approverToken}`);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'APPROVED');

  const published = await request(app).patch(`/api/results/${fixture.submissionId}/publish`)
    .set('Authorization', `Bearer ${approverToken}`);
  assert.equal(published.status, 200);
  assert.equal(published.body.status, 'PUBLISHED');

  await t.test('allows the student to see their own published result only', async () => {
    const own = await request(app).get(`/api/students/${student.student_id}/results`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(own.status, 200);
    assert.ok(own.body.results.some(row => row.code === courseCode && Number(row.score) === 78));
    const other = await request(app).get(`/api/students/${student.student_id + 999}/results`)
      .set('Authorization', `Bearer ${studentToken}`);
    assert.equal(other.status, 403);
  });

  await t.test('allows administrators to inspect the audit trail', async () => {
    const response = await request(app).get('/api/audit').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(response.status, 200);
    assert.ok(response.body.auditLogs.some(row => row.submission_id === fixture.submissionId));
  });

  await t.test('prevents publishing the same submission twice', async () => {
    const response = await request(app).patch(`/api/results/${fixture.submissionId}/publish`)
      .set('Authorization', `Bearer ${approverToken}`);
    assert.equal(response.status, 409);
  });
});
