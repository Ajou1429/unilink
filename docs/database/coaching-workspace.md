# Coaching workspace

The DB-ver coaching screen combines current-term courses, active personal goals,
weekly plans, course-session progress, calendar events, notes and problem-bank
subjects. It uses the existing account-scoped P0 hydration/sync bridge; it does
not create a second persistence path or change database migrations.

## Current behavior

- Local-calendar Sunday week navigation and goal filtering.
- Pending, completed and overdue task views. Overdue includes earlier weeks;
  undated legacy tasks are not silently assigned to the current week.
- Latest class progress is selected by class date/time, not edit time. Recorded
  difficulty and pace remain qualitative values, not inferred mastery.
- Notes can be filtered by their explicit goal link and searched, 20 at a time.
  Problem-bank subjects remain a separate all-subject inventory because a
  reliable goal/topic relationship is deferred in the current schema.
- Drive state is fetched from the existing connection API. Read failures have
  a retry action and are not presented as successful empty responses.
- Course/goal detail, execution, progress entry, resource management and outcomes
  link to their existing service screens.
- Coaching request drafts store a versioned, account-scoped browser record with
  target, intent, period, daily availability, desired outcome and constraints.
  Drafts are not yet cloud-synchronized, sent to an LLM or saved as study plans.

## Agent integration boundary

Map selected UI IDs to the existing stable P0 goal IDs on the server. Keep
period/goal references in the plan contract and validate additional request
conditions as versioned metadata. Confirm actual availability; recurring schedule
counts and an empty calendar do not imply free study time. P0 sync's inferred
legacy durations must not be treated as observed study time.

The generation control remains disabled until a real endpoint exists. The next
increment needs structured proposals, constraint validation, selected/deferred
items with reasons, atomic approval/application, revision history and run logs.
Google-derived content requires the appropriate data-use policy review before
being included in model requests.

## Validation

- 77 existing and focused unit/database simulation tests passed.
- Desktop 1440px, tablet 768px and phone 390px checked in isolated headless Edge.
- Empty/populated screens, class and personal-goal records, request save/reload,
  overdue filters and resource tabs exercised with fictional browser data.
- No horizontal document overflow or uncaught page errors in those scenarios.
- OAuth/live signed-in Drive access and LLM generation were not tested by this UI test.

Only DB-ver receives this UI release; pushing the branch does not publish it to
the main GitHub Pages deployment.
