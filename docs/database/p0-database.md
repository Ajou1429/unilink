# P0 Database Implementation

## Scope

Based on the UniLink DB/ERD v2.1 review document and Planner Policy v1.
The branch is `DB-ver`. The linked Supabase project is `beqdvsfwybuisylxbqko`.
A Git branch does not create a separate Supabase database: applying these migrations changes the linked project used by the existing deployment.

| Migration | Tables |
| --- | --- |
| 0010_core_learning | user_preferences, courses, course_schedules, learning_goals, goal_topics, study_methods |
| 0011_p0_schedules | calendar_events, recurring_commitments, course_sessions, course_session_topics |
| 0012_p0_planning_execution | study_plans, study_plan_items, study_sessions |

Existing notes, Drive OAuth data, Storage and Problem Bank tables and policies are retained.
This delivery creates the database foundation and an account-scoped synchronization bridge from the existing privateStorage UI.
On a verified sign-in, the bridge saves an account-scoped pre-import browser snapshot, replays pending writes, hydrates remote records, then imports remaining local records using stable per-user UUIDs. Subsequent UI changes are synchronized by storage key.
Browser data is not accessible to a DB migration, so the bridge performs the import in the signed-in browser. Initial imports do not overwrite existing remote rows with the same stable ID.
Legacy plan items without a duration use a 30-minute placeholder marked `estimated_minutes: true` in metadata; it is not observed study time or an agent-confirmed target. Legacy records without an explicit due date remain undated.
The fallback study method is also marked `estimated_method: true`; unknown completion timestamps use the import time with `completed_at_estimated: true`. These values must not be treated as observed facts by a future agent. Legacy pace labels are retained without inventing a numerical scale.
The cache remains the current UI write path; this bridge is persistence synchronization, not a full conversion of each screen to direct database queries.
Notes, Drive file contents, and browser-only attachment data are outside P0 and are not copied by this bridge.

The durable account-scoped `unilink:p0-outbox-v1` queue retries on reconnect, new writes and initialization. The initial browser snapshot uses `unilink:p0-before-import-v1`. These are browser recovery aids, not database backups.
Remote reads are paginated. Archive/cancel markers (and versioned metadata tombstones for recurring commitments and class-session records) prevent stale browser caches from restoring deletions. Reconciliation only touches IDs explicitly changed in that browser.
Course and weekly copies of a plan share one DB plan/item; monthly `weekly-*` entries are derived UI mirrors. Free-standing planner tasks use a dedicated personal goal.
This bridge is not a transactional planner API: related writes can be temporarily partial after a network failure and are replayed idempotently. Concurrent edits of the same record from separate devices do not yet have conflict resolution.

## Implementation decisions

- `target_date` is the representative goal deadline. Individual exams and assignments use calendar_events. Goals are completed explicitly; there is no term-end auto-completion.
- One course goal per course instance, including archived goals. Reactivation uses that goal; additional personal goals can coexist.
- Manual topics default to confirmed. Future analyzer clients must explicitly create candidate topics. Approval UX remains P1.
- Topic depth is 1 through 3. A generated parent_depth plus composite FK enforces same goal, same owner, immediate parent depth and acyclic ancestry, including concurrent writes.
- Moves involving an existing subtree need a transaction that defers the relevant FKs and updates all affected depths. The final tree must satisfy every constraint.
- Plans begin at revision 1. Each next revision references its immediate predecessor; one successor is permitted. Decreasing parent revision values prevent cycles.
- Approved/active/completed plans require approved_at. P0 stores valid states and revision relationships; approval/revision workflow and protection of approved content will be implemented in the application/RPC layer before AI plan application.
- Idempotency keys are optional but unique per user. Future approve/apply callers must supply a stable key and write plan/items atomically. The unique index alone is not an approval workflow.
- Mutable tables include created_at and updated_at. study_sessions preserves fractional actual minutes to four decimal places (not 30-minute UI blocks). This intentionally refines the document's smallint suggestion.
- Unknown mastery/pace values stay NULL. When supplied, 1..5 is enforced; no mastery estimate or aggregation policy is invented.
- Monthly plan horizon is supported to preserve the existing monthly planner in addition to the document's daily/weekly/exam_period/custom values.
- Weekly slots use 0=Sunday through 6=Saturday and local time in the user's timezone. Overnight weekly slots are split at midnight; one-off timestamp events can cross midnight. Effective dates are inclusive.
- Blocking events need a positive start/end interval. Deadline-only events are nonblocking. Plan item windows must fit their planned minutes; actual active minutes may be shorter than elapsed time because of breaks.
- Topic/goal/plan references use composite ownership FKs. course_session_topics also carries course_id and goal_id so the database verifies that the topic belongs to the taught course. Actual study may use a different topic from its plan item within the same goal.
- Referenced goals/topics/plans/study records use NO ACTION FKs, deferrable within a transaction; archive/cancel is the normal user workflow. Course schedules and course-session topic links cascade with their parent. Deleting an auth account cascades its owned data; tested across the full graph.
- JSON objects require a positive integer schema_version, default 1. This is stricter than an empty-object default and establishes a version contract now. No blanket GIN indexes are added.
- study_methods is an authenticated-read-only lookup with nine methods. Display names need not be unique; codes are stable. Service-role operations manage the lookup.
- profiles is outside this P0 implementation. auth.users is the owner source; no competing profile schema is introduced.

## Planner Policy boundary

P0 stores facts and supports later calculations. Day-specific availability can be supplied in study_plans.request_metadata; preferences can hold versioned optional windows in metadata until a dedicated contract is needed.
An empty calendar is not proof of all-day availability.

The database checks ownership, valid dates/time ranges, nonnegative durations, hierarchy, versioned JSON and duplicate request keys.
The future Planner validator must also calculate actual available windows, reserve breaks/travel time, check cross-table schedule conflicts and cumulative daily capacity before approving a plan.
P0 does not yet enforce those cross-table scheduling policies or generate plans.

Method minimum durations, staleness thresholds, switching limits and coverage weights remain tunable policy hypotheses, not SQL CHECK constants.
selected_items/deferred_items, exclusion reasons and policy_version belong to the P1 coaching run output contract.
D-day, recent load, accuracy and review debt are derived from facts, not copied into competing source columns.

## Deferred P1 dependencies

Observations/current state, learner snapshots, coaching_runs/feedback/messages/outcomes, resource registry/topic links, topic analyzer and problem attempts are P1.
Add study_plans.coaching_run_id together with its ownership FK once coaching_runs exists; P0 has no unconstrained dangling UUID placeholder.
Existing notes retain their present links. The later resource registry will connect them via note_id and ownership FK.
Problem Bank goal/topic extensions and owner-verified imports are follow-up migrations; existing level 0..5 keeps its meaning.

## Validation and deployment

Run `node --test tests/p0-db.test.mjs tests/security-db.test.mjs` for PostgreSQL-backed checks using PGlite and the actual migration files.
Run `node --test tests/p0-sync.test.mjs` for the actual browser persistence modules against the migrated PGlite database through a simulated Supabase transport. This covers import, restore, update, deletion, retry, account switching and pagination, but not hosted Auth/HTTP behavior.
Run `node scripts/export-p0-dictionary.mjs` to regenerate the full column dictionary from the migrated database catalog.
PGlite supplies a minimal Supabase auth/role fixture; hosted gateway behavior is not covered by those tests.

Before deployment, use `supabase db query --linked --file supabase/tests/p0_preflight.sql` to record structural inventory and row counts.
Save its output under ignored `supabase/.temp/`. This inventory contains no row content or credentials and is not a complete database backup.
Then use `supabase db push --linked --dry-run` and `supabase db push --linked`.
Migrations use transactions individually; if a later file fails, earlier successfully applied files remain. Fix and re-run pending migrations after checking migration history.

These migrations add tables/functions and seed lookup rows; they do not update/delete existing business data.
If deployment must be halted, leave the additive schema in place and keep the existing application operating. Do not drop populated P0 tables to roll back UI code. Once P0 contains user data, export it before any destructive rollback.

## Deployment result

Migrations 0010, 0011 and 0012 were applied successfully to the linked PostgreSQL 17.6 project.
Local and remote migration histories match through 0012. All 13 new tables have RLS enabled; anonymous access and authenticated TRUNCATE are denied.
The local PostgreSQL tests passed (18 tests including parent suites). Existing table columns, constraints, indexes and policies match the pre-deployment inventory.
Counts before and after: notes 363, Drive connections 3, Problem Bank subjects 3, problems 0.
Local ignored structural inventories are at supabase/.temp/p0-before-inventory.json and supabase/.temp/p0-after-inventory.json.
No complete data backup was created during schema deployment. Application sync imports browser data on the next verified sign-in; no browser cache is cleared by the bridge.

See [P0 verification, 2026-09-27](p0-verification-2026-09-27.md) for the latest audit, findings and remaining release gates.

See [Service simulation database](simulation.md) for seeded fictional users, persistent isolated PostgreSQL fixtures, actual service-code scenarios, and the boundary between simulated and live integrations.
