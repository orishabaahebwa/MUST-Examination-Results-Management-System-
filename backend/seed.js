require('dotenv').config();
if (process.env.NODE_ENV === 'production') {
  throw new Error('The legacy demo seed is disabled in production.');
}
const bcrypt = require('bcryptjs');
const db = require('./db');

async function run() {
  const password = process.env.LEGACY_DEMO_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Set LEGACY_DEMO_PASSWORD to a local password of at least 12 characters.');
  }
  const demoStudentNumber = 'DEMO-0001';
  const hash = await bcrypt.hash(password, 12);

  const users = [
    ['System Administrator','admin@must.test','ADMIN',null],
    ['Victor Lecturer','lecturer@must.test','LECTURER',null],
    ['Academic Reviewer','reviewer@must.test','REVIEWER',null],
    ['Academic Registrar','registrar@must.test','APPROVER',null]
  ];

  for (const [name,email,role,studentId] of users) {
    await db.execute(
      `INSERT INTO users(name,email,password_hash,role,student_id)
       VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name),password_hash=VALUES(password_hash),
       role=VALUES(role)`,
      [name,email,hash,role,studentId]
    );
  }

  const [students] = await db.execute(
    'SELECT id FROM students WHERE registration_number=?',
    [demoStudentNumber]
  );

  let studentId = students[0]?.id;

  if (!studentId) {
    const [s] = await db.execute(
      'INSERT INTO students(registration_number,name,programme,year_of_study) ' +
      "VALUES(?,'Demo Student','BSc Software Engineering',2)",
      [demoStudentNumber]
    );
    studentId = s.insertId;
  }

  await db.execute(
    `INSERT INTO users(name,email,password_hash,role,student_id)
     VALUES(?,?,?,?,?)
     ON DUPLICATE KEY UPDATE student_id=VALUES(student_id),password_hash=VALUES(password_hash)`,
    ['Demo Student','student@must.test',hash,'STUDENT',studentId]
  );

  await db.execute(
    `INSERT INTO courses(code,title) VALUES('SWE2106','Internet Technologies and Web Design')
     ON DUPLICATE KEY UPDATE title=VALUES(title)`
  );

  await db.execute(
    `INSERT INTO semesters(name,academic_year) VALUES('Semester One','2026/2027')
     ON DUPLICATE KEY UPDATE academic_year=VALUES(academic_year)`
  );

  const [[lecturer]] = await db.execute(
    'SELECT id FROM users WHERE email=?', ['lecturer@must.test']
  );
  const [[course]] = await db.execute(
    'SELECT id FROM courses WHERE code=?', ['SWE2106']
  );
  const [[semester]] = await db.execute(
    'SELECT id FROM semesters WHERE name=? AND academic_year=?',
    ['Semester One','2026/2027']
  );

  await db.execute(
    `INSERT INTO lecturer_assignments(lecturer_id,course_id,semester_id)
     VALUES(?,?,?) ON DUPLICATE KEY UPDATE lecturer_id=VALUES(lecturer_id)`,
    [lecturer.id,course.id,semester.id]
  );

  console.log('Demo data created.');
  console.log('Legacy demo data created; credentials were not printed.');
  await db.end();
}

run().catch(async error => {
  console.error(error);
  await db.end();
  process.exit(1);
});
