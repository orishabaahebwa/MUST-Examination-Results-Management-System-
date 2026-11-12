require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./db');
const { authenticate, allow } = require('./middleware');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured in .env');
}

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'MUST Results API' });
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string' ||
        !email.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [rows] = await db.execute(
      'SELECT id,name,email,password_hash,role,student_id,active FROM users WHERE email=?',
      [email.trim().toLowerCase()]
    );

    const user = rows[0];
    if (!user || !user.active ||
        !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.student_id
    }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/semesters', authenticate, async (req, res, next) => {
  try {
    const [semesters] = await db.execute(
      `SELECT id, name, academic_year
       FROM semesters
       ORDER BY academic_year DESC, id DESC`
    );

    res.json({ semesters });
  } catch (error) {
    next(error);
  }
});

app.get('/api/courses', authenticate, async (req, res, next) => {
  try {
    let sql = 'SELECT id,code,title FROM courses ORDER BY code';
    let params = [];

    if (req.user.role === 'LECTURER') {
      sql = `SELECT c.id,c.code,c.title
             FROM courses c
             JOIN lecturer_assignments a ON a.course_id=c.id
             WHERE a.lecturer_id=?`;
      params = [req.user.id];
    }

    const [rows] = await db.execute(sql, params);
    res.json({ courses: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/students', authenticate, allow('ADMIN','REVIEWER','APPROVER','LECTURER'),
async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      'SELECT id,registration_number,name,programme,year_of_study FROM students ORDER BY name'
    );
    res.json({ students: rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/results', authenticate, allow('LECTURER'),
async (req, res, next) => {
  const connection = await db.getConnection();

  try {
    const { courseId, semesterId, marks } = req.body || {};

    if (!Number.isInteger(Number(courseId)) ||
        !Number.isInteger(Number(semesterId)) ||
        !Array.isArray(marks) || marks.length === 0) {
      return res.status(400).json({ error: 'Valid courseId, semesterId and non-empty marks are required' });
    }

    const seen = new Set();

    for (const mark of marks) {
      const studentId = Number(mark.studentId);
      const score = Number(mark.score);

      if (!Number.isInteger(studentId) ||
          !Number.isFinite(score) || score < 0 || score > 100 ||
          seen.has(studentId)) {
        return res.status(422).json({
          error: 'Every mark needs a unique valid studentId and score between 0 and 100'
        });
      }

      seen.add(studentId);
    }

    await connection.beginTransaction();

    const [assignment] = await connection.execute(
      `SELECT id FROM lecturer_assignments
       WHERE lecturer_id=? AND course_id=? AND semester_id=?`,
      [req.user.id, Number(courseId), Number(semesterId)]
    );

    if (!assignment.length) {
      await connection.rollback();
      return res.status(403).json({ error: 'Lecturer is not assigned to this course and semester' });
    }

    const ids = marks.map(m => Number(m.studentId));
    const placeholders = ids.map(() => '?').join(',');

    const [students] = await connection.execute(
      `SELECT id FROM students WHERE id IN (${placeholders})`, ids
    );

    if (students.length !== ids.length) {
      await connection.rollback();
      return res.status(422).json({ error: 'One or more students do not exist' });
    }

    const [result] = await connection.execute(
      'INSERT INTO submissions(course_id,semester_id,lecturer_id,status) VALUES(?,?,?,?)',
      [Number(courseId), Number(semesterId), req.user.id, 'SUBMITTED']
    );

    for (const mark of marks) {
      await connection.execute(
        'INSERT INTO marks(submission_id,student_id,score) VALUES(?,?,?)',
        [result.insertId, Number(mark.studentId), Number(mark.score)]
      );
    }

    await connection.execute(
      'INSERT INTO audit_logs(user_id,submission_id,action,details) VALUES(?,?,?,?)',
      [req.user.id, result.insertId, 'SUBMITTED', 'Lecturer submitted marks']
    );

    await connection.commit();
    res.status(201).json({
      message: 'Results submitted successfully',
      submissionId: result.insertId,
      status: 'SUBMITTED'
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Results already submitted for this course and semester' });
    }

    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/results', authenticate, async (req, res, next) => {
  try {
    let sql = `SELECT s.id,s.status,s.course_id,c.code,c.title,
                      s.semester_id,sem.name AS semester,
                      s.submitted_at,s.updated_at
               FROM submissions s
               JOIN courses c ON c.id=s.course_id
               JOIN semesters sem ON sem.id=s.semester_id`;
    let params = [];

    if (req.user.role === 'LECTURER') {
      sql += ' WHERE s.lecturer_id=?';
      params = [req.user.id];
    } else if (req.user.role === 'STUDENT') {
      return res.status(403).json({ error: 'Use the student results endpoint' });
    } else if (!['ADMIN','REVIEWER','APPROVER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    sql += ' ORDER BY s.submitted_at DESC';

    const [rows] = await db.execute(sql, params);
    res.json({ results: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/results/:id', authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const [rows] = await db.execute(
      `SELECT s.*,c.code,c.title,sem.name AS semester
       FROM submissions s
       JOIN courses c ON c.id=s.course_id
       JOIN semesters sem ON sem.id=s.semester_id
       WHERE s.id=?`, [id]
    );

    const submission = rows[0];

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (req.user.role === 'LECTURER' &&
        submission.lecturer_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    if (!['ADMIN','LECTURER','REVIEWER','APPROVER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const [marks] = await db.execute(
      `SELECT m.student_id,st.registration_number,st.name,m.score
       FROM marks m JOIN students st ON st.id=m.student_id
       WHERE m.submission_id=?`, [id]
    );

    res.json({ submission, marks });
  } catch (error) {
    next(error);
  }
});

app.put('/api/results/:id', authenticate, allow('LECTURER'),
async (req, res, next) => {
  const connection = await db.getConnection();

  try {
    const id = Number(req.params.id);
    const { marks } = req.body || {};

    if (!Number.isInteger(id) || id < 1 || !Array.isArray(marks) || !marks.length) {
      return res.status(400).json({ error: 'Valid submission ID and marks are required' });
    }

    const seen = new Set();
    for (const m of marks) {
      const sid = Number(m.studentId);
      const score = Number(m.score);
      if (!Number.isInteger(sid) || !Number.isFinite(score) ||
          score < 0 || score > 100 || seen.has(sid)) {
        return res.status(422).json({ error: 'Invalid or duplicate mark' });
      }
      seen.add(sid);
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT * FROM submissions WHERE id=? FOR UPDATE', [id]
    );

    if (!rows.length || rows[0].lecturer_id !== req.user.id) {
      await connection.rollback();
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (rows[0].status !== 'RETURNED') {
      await connection.rollback();
      return res.status(409).json({ error: 'Only returned submissions can be corrected' });
    }

    const ids = marks.map(m => Number(m.studentId));
    const [students] = await connection.execute(
      `SELECT id FROM students WHERE id IN (${ids.map(() => '?').join(',')})`, ids
    );

    if (students.length !== ids.length) {
      await connection.rollback();
      return res.status(422).json({ error: 'Unknown student ID' });
    }

    await connection.execute('DELETE FROM marks WHERE submission_id=?', [id]);

    for (const m of marks) {
      await connection.execute(
        'INSERT INTO marks(submission_id,student_id,score) VALUES(?,?,?)',
        [id, Number(m.studentId), Number(m.score)]
      );
    }

    await connection.execute(
      `UPDATE submissions SET status='SUBMITTED',correction_reason=NULL
       WHERE id=?`, [id]
    );

    await connection.execute(
      'INSERT INTO audit_logs(user_id,submission_id,action,details) VALUES(?,?,?,?)',
      [req.user.id, id, 'RESUBMITTED', 'Corrected and resubmitted marks']
    );

    await connection.commit();
    res.json({ message: 'Corrected results resubmitted', status: 'SUBMITTED' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.patch('/api/results/:id/verify', authenticate, allow('REVIEWER'),
async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { decision, reason } = req.body || {};

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    if (!['VERIFY','RETURN'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be VERIFY or RETURN' });
    }

    if (decision === 'RETURN' &&
        (typeof reason !== 'string' || !reason.trim())) {
      return res.status(422).json({ error: 'A correction reason is required' });
    }

    const status = decision === 'VERIFY' ? 'VERIFIED' : 'RETURNED';

    const [result] = await db.execute(
      `UPDATE submissions SET status=?,correction_reason=?
       WHERE id=? AND status='SUBMITTED'`,
      [status, decision === 'RETURN' ? reason.trim() : null, id]
    );

    if (!result.affectedRows) {
      return res.status(409).json({ error: 'Submission not found or not in SUBMITTED state' });
    }

    await db.execute(
      'INSERT INTO audit_logs(user_id,submission_id,action,details) VALUES(?,?,?,?)',
      [req.user.id, id, status, reason || 'Reviewer verified results']
    );

    res.json({ message: 'Review completed', status });
  } catch (error) {
    next(error);
  }
});

async function transition(req, res, next, from, to, role) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const [result] = await db.execute(
      'UPDATE submissions SET status=? WHERE id=? AND status=?',
      [to, id, from]
    );

    if (!result.affectedRows) {
      return res.status(409).json({
        error: `Submission must be in ${from} state before ${to.toLowerCase()}`
      });
    }

    await db.execute(
      'INSERT INTO audit_logs(user_id,submission_id,action,details) VALUES(?,?,?,?)',
      [req.user.id, id, to, `${role} changed status from ${from} to ${to}`]
    );

    res.json({ message: `Results ${to.toLowerCase()} successfully`, status: to });
  } catch (error) {
    next(error);
  }
}

app.patch('/api/results/:id/approve', authenticate, allow('APPROVER'),
(req, res, next) => transition(req, res, next, 'VERIFIED', 'APPROVED', 'Approver'));

app.patch('/api/results/:id/publish', authenticate, allow('APPROVER'),
(req, res, next) => transition(req, res, next, 'APPROVED', 'PUBLISHED', 'Approver'));

app.get('/api/students/:studentId/results', authenticate,
async (req, res, next) => {
  try {
    const studentId = Number(req.params.studentId);

    if (req.user.role !== 'STUDENT' ||
        !Number.isInteger(studentId) ||
        req.user.studentId !== studentId) {
      return res.status(403).json({ error: 'You may only access your own results' });
    }

    const [rows] = await db.execute(
      `SELECT c.code,c.title,sem.name AS semester,
              sem.academic_year,m.score,s.status
       FROM marks m
       JOIN submissions s ON s.id=m.submission_id
       JOIN courses c ON c.id=s.course_id
       JOIN semesters sem ON sem.id=s.semester_id
       WHERE m.student_id=? AND s.status='PUBLISHED'
       ORDER BY sem.academic_year DESC,c.code`,
      [studentId]
    );

    res.json({ results: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/audit', authenticate, allow('ADMIN','APPROVER'),
async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT a.id,a.action,a.details,a.created_at,u.name AS actor,
              a.submission_id
       FROM audit_logs a JOIN users u ON u.id=a.user_id
       ORDER BY a.created_at DESC LIMIT 200`
    );
    res.json({ auditLogs: rows });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);

  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message
  });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`MUST Results API running on http://localhost:${port}`);
  });
}

module.exports = app;
