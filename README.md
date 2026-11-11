# MUST Examination Results Management System

The primary application is a Next.js App Router application using Supabase Auth and PostgreSQL. The existing Express/MySQL backend and static frontend are retained as a rollback reference and can still be run with the legacy package scripts.

See [docs/SUPABASE_NEXT_MIGRATION.md](docs/SUPABASE_NEXT_MIGRATION.md) for the current application setup, feature map, database security notes and verification status.

The remainder of this README documents the preserved legacy Express/MySQL prototype. Its shared demonstration accounts are not valid for production and are intentionally omitted here. Legacy demo seeding is disabled when NODE_ENV is production.

## Requirements

- Node.js 20 or newer
- MySQL 8
- npm
- Postman (for API demonstration)

## Installation

1. Install MySQL and start the database server.
2. Import `database/schema.sql` into MySQL.
3. Copy `.env.example` to `.env`.
4. Configure database credentials and replace JWT_SECRET.
5. Install dependencies:

   npm install

6. For the preserved legacy app only, set a local `LEGACY_DEMO_PASSWORD` (at least 12 characters) in `.env`, then create sample records:

   npm run seed

7. Start the legacy server:

   npm run start:legacy

8. Open:

   http://localhost:3000

## Database identifiers

The demo seed creates one course, one semester and one student. Query the
database to obtain their IDs:

```sql
SELECT * FROM courses;
SELECT * FROM semesters;
SELECT * FROM students;
```

Use those IDs in the lecturer submission form and Postman variables.

## Workflow

SUBMITTED -> VERIFIED -> APPROVED -> PUBLISHED

SUBMITTED -> RETURNED -> SUBMITTED

A reviewer must supply a reason when returning results. Only the assigned
lecturer can correct and resubmit a returned submission.

## API

| Method | Endpoint | Access |
|---|---|---|
| POST | /api/auth/login | Public |
| GET | /api/me | Authenticated |
| GET | /api/courses | Authenticated |
| GET | /api/students | Staff |
| POST | /api/results | Lecturer |
| GET | /api/results | Staff |
| GET | /api/results/:id | Authorised staff |
| PUT | /api/results/:id | Assigned lecturer |
| PATCH | /api/results/:id/verify | Reviewer |
| PATCH | /api/results/:id/approve | Approver |
| PATCH | /api/results/:id/publish | Approver |
| GET | /api/students/:studentId/results | That student |
| GET | /api/audit | Administrator / approver |

## Testing

The automated integration tests require the database to be running and seeded.

Run:

```bash
npm test
```

The test suite exercises authentication, access control, submission,
duplicate prevention, review, approval, publication and student access.

For repeatable tests, use a dedicated test database and reset it before
each run. Do not run the workflow tests against real university data.

## Postman

Import `postman/MUST_API_Collection.json`.

Set the base URL to `http://localhost:3000`.

Login as each role and copy the returned token into the collection's
`token` variable. Use the appropriate account for each protected route.

The collection includes the main workflow and invalid login/marks examples.

## GitHub teamwork

Suggested branches:

- feature/backend-api
- feature/database
- feature/authentication
- feature/frontend
- feature/postman-tests
- docs/readme

Each team member should commit their own work, push a feature branch,
and open a pull request. Do not fabricate pull requests or contributions.

## Production considerations

This is an educational prototype, not an official MUST information system.
Before real deployment, add university-approved grading rules, stronger
account administration, CSRF protection if cookie authentication is adopted,
comprehensive audit retention, backups, HTTPS, monitoring, access reviews,
database migrations and a security assessment.

Use fictional data for classroom demonstrations.
