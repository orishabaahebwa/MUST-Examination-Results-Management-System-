# Supabase and Next.js application

## Setup

The root application uses Next.js 16 App Router, Supabase Auth and the existing Supabase PostgreSQL project. Next.js 16 requires Node.js 20.9 or newer. Start locally with `npm install` followed by `npm run dev`; use `npm run build`, `npm run lint`, `npm run typecheck` and `npm test` for verification.

Copy `.env.example` to `.env.local` and configure the project URL and publishable key from Supabase. Never place a Supabase secret/service-role key in this app. Set `NEXT_PUBLIC_SITE_URL` to the local or hosted origin. Google OAuth is disabled until its provider is configured in Supabase Auth and the approved redirect URL is registered.

Email registration accepts `@must.ac.ug` and `@std.must.ac.ug`, matching the existing signup trigger. Supabase email confirmation must be enabled. Registration sends only the user's name as metadata; the existing trigger assigns `STUDENT` and `PENDING`. An administrator must approve and activate access.

## Existing schema map

| Application feature | Existing Supabase tables and functions |
|---|---|
| Catalogue | `departments`, `academic_years`, `semesters`, `courses`, `course_offerings` |
| Staff assignment | `course_staff` |
| Student enrolment | `profiles`, `enrollments` |
| Assessment setup and batch marks | `assessments`, `marks` |
| Lecturer submit/correct | `result_submissions`, `resubmit_returned_results` |
| Review and return | `review_actions`, `review_result_submission` |
| Registrar approval/publication | `review_result_submission`, `publish_approved_results` |
| Student results and reports | `published_results` |
| Audit and help | `audit_logs`, `support_tickets` |
| User access | `profiles`, `admin_set_user_access` |

The publishing RPC owns weighted total and grade calculation. Application code does not calculate a final mark or assign a grade.

## Hardened remote database and application permissions

The project owner reports that these remote migrations were applied. This repository does not contain their executable SQL, and no SQL was applied during this task:

- `harden_api_privileges_and_results_workflow`
- `secure_future_public_object_defaults`

Read-only checks against the project confirmed authenticated users have SELECT access subject to RLS and the following write grants:

| Table | Authenticated write columns / route |
|---|---|
| `departments` | INSERT/UPDATE `code`, `created_at`, `id`, `name` (admin RLS / action checks apply). |
| `academic_years` | INSERT/UPDATE `ends_on`, `id`, `is_current`, `label`, `starts_on` (admin RLS / action checks apply). |
| `semesters` | INSERT/UPDATE `academic_year_id`, `ends_on`, `id`, `name`, `starts_on`, `status` (admin RLS / action checks apply). |
| `courses` | INSERT/UPDATE `code`, `created_at`, `credit_units`, `department_id`, `id`, `level`, `title` (admin RLS / action checks apply). |
| `course_offerings` | INSERT/UPDATE `course_id`, `created_at`, `group_name`, `id`, `semester_id` (admin RLS / action checks apply). |
| `course_staff` | INSERT/UPDATE `assigned_by`, `assignment_role`, `created_at`, `id`, `offering_id`, `user_id` (admin RLS / action checks apply). |
| `enrollments` | INSERT/UPDATE `created_at`, `enrollment_status`, `id`, `offering_id`, `student_id` (admin RLS / action checks apply). |
| `profiles` | UPDATE `full_name` only. Role and account status remain protected. |
| `assessments` | INSERT `assessment_type`, `created_by`, `maximum_mark`, `offering_id`, `title`, `weight`; UPDATE `assessment_type`, `maximum_mark`, `title`, `weight`. |
| `marks` | INSERT `assessment_id`, `entered_by`, `mark`, `student_id`; UPDATE `mark`, `updated_at`, `updated_by`. RLS requires enrolled students. |
| `result_submissions` | INSERT `lecturer_note`, `offering_id`, `status`, `submitted_by`; workflow changes use protected RPCs. |
| `support_tickets` | INSERT `created_by`, `message`, `subject` only. |
| `published_results`, `review_actions`, `audit_logs` | No direct authenticated writes. Workflow RPCs write protected review/audit records. |

The four protected functions remain `SECURITY DEFINER`, use an empty `search_path`, and have these signatures: `admin_set_user_access(p_user_id uuid, p_role text, p_status text)`, `publish_approved_results(p_submission_id uuid)`, `resubmit_returned_results(p_submission_id uuid, p_lecturer_note text DEFAULT NULL)`, and `review_result_submission(p_submission_id uuid, p_action text, p_comments text DEFAULT NULL)`. Read-only inspection of the review/resubmit bodies confirmed active-role, assignment and workflow-state checks. Their audit and review-action writes remain inside the protected functions.

### Remaining default-privilege limitation

Read-only inspection of `pg_default_acl` shows `supabase_admin` still has broad default privileges configured for future objects in `public`: table DML grants and sequence privileges for `anon`, `authenticated` and `service_role`, plus function EXECUTE grants for those roles. The `secure_future_public_object_defaults` migration does not remove this owner-specific default ACL. Review grants and RLS for every future public object created as `supabase_admin`; do not assume the current table hardening automatically protects future objects.

### Application handling

- The app reads protected tables through the authenticated Supabase client and RLS.
- Support tickets are inserted only with `created_by`, `subject`, and `message`; status is displayed read-only because there is no approved update route.
- The app no longer inserts directly into `audit_logs`. Reviewer decisions, approval, resubmission, access administration and publication use the protected RPCs. Direct audit inserts for catalogue, assessment and mark changes are not available under these grants; add a database-owned audit trigger or narrowly scoped RPC in a separately reviewed migration if those events must be recorded.
- Mark entry first uses `upsert` with `ignoreDuplicates: true` and only the INSERT-granted fields (`assessment_id`, `student_id`, `mark`, `entered_by`). Conflicted rows are updated separately with only UPDATE-granted fields (`mark`, `updated_by`). Enrolment and offering assignment are validated in the server action and again by RLS. This is not a database transaction across the insert and update calls; if a later update fails, the action reports that some marks may already have been saved.

## Security observations from read-only project inspection

- All 15 existing public tables have RLS enabled. Policies use `auth.uid()`, profile state/role and course assignment helpers.
- The new profile column grants restrict authenticated UPDATE to `full_name`; role and account status are not writable by users. Admin role/status changes remain behind `admin_set_user_access`.
- The four security-advisor warnings concern authenticated execution of `SECURITY DEFINER` functions. Their ACLs grant execution to `authenticated` and `service_role`, not `anon` or `PUBLIC`; function bodies use an empty `search_path`. Keep authorization in the bodies and do not revoke access without checking call sites.
- Read-only inspection of the hardened `review_result_submission` and `resubmit_returned_results` bodies confirmed active account, role, assignment and valid-state checks for direct RPC calls.
- Marks RLS now independently checks student enrolment, so direct PostgREST calls cannot bypass the enrollment predicate described in the earlier review.
- Lecturer RLS exposes enrolment IDs but not other student profile names. Batch entry shows IDs only. A reviewed policy for staff to read only necessary roster fields would improve usability while preserving student privacy.

No remote database schema or data was changed during this work.

## Migration and rollback

The legacy Express/MySQL code and static frontend remain in place. Use `npm run dev:legacy` or `npm run start:legacy` to run the old app; the existing SQL schema and record backup were not altered. The default `npm run dev` and `npm start` now target Next.js.

The legacy demo seed refuses to run when `NODE_ENV=production`. Treat the old MySQL backup as private and keep it excluded from source control.

## Framework references checked

- [Supabase SSR client setup](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase server-side authentication guidance](https://supabase.com/docs/guides/auth/server-side)
- [Next.js 16 Proxy convention](https://nextjs.org/docs/app/getting-started/proxy)
- [Next.js cookies API](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [Next.js ESLint flat configuration](https://nextjs.org/docs/app/api-reference/config/eslint)

## Verification record

The dependency-free tests cover MUST email domains, safe authentication redirects, active-role checks, batch mark boundaries, hardened write-column handling, workflow RPC wiring, student ownership filters, ignore rules and shared responsive UI states. Ten tests passed after the permission-compatibility repair. Offline JavaScript syntax and JSON validation also passed. Loading, route-error, database-query-error and returned-mark correction states have explicit UI handling.

Dependency installation was attempted but could not access `registry.npmjs.org` (`EACCES`). The existing `package-lock.json` therefore does not yet include the Next.js, React or Supabase dependencies. Lint, TypeScript checking and the production build could not run because their executables are not installed. Run `npm install` when registry access is available, then regenerate the lockfile and rerun all three checks.

Live Supabase RLS/workflow tests still need dedicated non-production users and fixtures. Read-only catalog checks confirmed the role column restriction is in effect and the workflow RPC signatures are present. Review the remaining `supabase_admin` default privileges for future public objects, and decide how non-workflow catalogue/assessment/mark changes should be recorded in the audit trail before production acceptance.
