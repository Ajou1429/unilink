# P0 Column Dictionary

Generated from the P0 migrations by `node scripts/export-p0-dictionary.mjs`.
See [P0 implementation decisions](p0-database.md) for scope, migration assumptions and deferred application behavior.

All timestamp defaults use `now()`. UUID keys use `gen_random_uuid()`. Mutable tables have an updated_at trigger.
Authenticated users receive SELECT/INSERT/UPDATE/DELETE on their own rows, except study_methods (read only). Anonymous access is revoked.

## calendar_events

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| goal_id | uuid | YES | - |
| event_type | text | NO | - |
| title | text | NO | - |
| starts_at | timestamp with time zone | YES | - |
| ends_at | timestamp with time zone | YES | - |
| due_at | timestamp with time zone | YES | - |
| is_blocking | boolean | NO | false |
| importance | smallint | YES | - |
| status | text | NO | 'scheduled'::text |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `calendar_events_check`: `CHECK (((starts_at IS NOT NULL) OR (due_at IS NOT NULL)))`
- `calendar_events_check1`: `CHECK (((ends_at IS NULL) OR ((starts_at IS NOT NULL) AND (ends_at >= starts_at))))`
- `calendar_events_check2`: `CHECK (((NOT is_blocking) OR ((starts_at IS NOT NULL) AND (ends_at IS NOT NULL) AND (ends_at > starts_at))))`
- `calendar_events_created_at_not_null`: `NOT NULL created_at`
- `calendar_events_event_type_check`: `CHECK ((event_type = ANY (ARRAY['exam'::text, 'assignment'::text, 'quiz'::text, 'presentation'::text, 'project'::text, 'appointment'::text, 'other'::text])))`
- `calendar_events_event_type_not_null`: `NOT NULL event_type`
- `calendar_events_goal_id_user_id_fkey`: `FOREIGN KEY (goal_id, user_id) REFERENCES learning_goals(id, user_id) DEFERRABLE`
- `calendar_events_id_not_null`: `NOT NULL id`
- `calendar_events_id_user_id_key`: `UNIQUE (id, user_id)`
- `calendar_events_importance_check`: `CHECK (((importance >= 1) AND (importance <= 5)))`
- `calendar_events_is_blocking_not_null`: `NOT NULL is_blocking`
- `calendar_events_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `calendar_events_metadata_not_null`: `NOT NULL metadata`
- `calendar_events_pkey`: `PRIMARY KEY (id)`
- `calendar_events_status_check`: `CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])))`
- `calendar_events_status_not_null`: `NOT NULL status`
- `calendar_events_title_check`: `CHECK ((length(btrim(title)) > 0))`
- `calendar_events_title_not_null`: `NOT NULL title`
- `calendar_events_updated_at_not_null`: `NOT NULL updated_at`
- `calendar_events_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `calendar_events_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE INDEX calendar_events_goal_type_idx ON public.calendar_events USING btree (goal_id, user_id, event_type)`
- `CREATE UNIQUE INDEX calendar_events_id_user_id_key ON public.calendar_events USING btree (id, user_id)`
- `CREATE UNIQUE INDEX calendar_events_pkey ON public.calendar_events USING btree (id)`
- `CREATE INDEX calendar_events_user_due_idx ON public.calendar_events USING btree (user_id, due_at)`
- `CREATE INDEX calendar_events_user_start_idx ON public.calendar_events USING btree (user_id, starts_at)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.

## course_schedules

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| course_id | uuid | NO | - |
| day_of_week | smallint | NO | - |
| start_time | time without time zone | NO | - |
| end_time | time without time zone | NO | - |
| location | text | YES | - |
| effective_from | date | YES | - |
| effective_to | date | YES | - |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `course_schedules_check`: `CHECK ((start_time < end_time))`
- `course_schedules_check1`: `CHECK (((effective_from IS NULL) OR (effective_to IS NULL) OR (effective_from <= effective_to)))`
- `course_schedules_course_id_day_of_week_start_time_end_time__key`: `UNIQUE NULLS NOT DISTINCT (course_id, day_of_week, start_time, end_time, effective_from, effective_to)`
- `course_schedules_course_id_not_null`: `NOT NULL course_id`
- `course_schedules_course_id_user_id_fkey`: `FOREIGN KEY (course_id, user_id) REFERENCES courses(id, user_id) ON DELETE CASCADE`
- `course_schedules_created_at_not_null`: `NOT NULL created_at`
- `course_schedules_day_of_week_check`: `CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))`
- `course_schedules_day_of_week_not_null`: `NOT NULL day_of_week`
- `course_schedules_end_time_not_null`: `NOT NULL end_time`
- `course_schedules_id_not_null`: `NOT NULL id`
- `course_schedules_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `course_schedules_metadata_not_null`: `NOT NULL metadata`
- `course_schedules_pkey`: `PRIMARY KEY (id)`
- `course_schedules_start_time_not_null`: `NOT NULL start_time`
- `course_schedules_updated_at_not_null`: `NOT NULL updated_at`
- `course_schedules_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `course_schedules_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE UNIQUE INDEX course_schedules_course_id_day_of_week_start_time_end_time__key ON public.course_schedules USING btree (course_id, day_of_week, start_time, end_time, effective_from, effective_to) NULLS NOT DISTINCT`
- `CREATE UNIQUE INDEX course_schedules_pkey ON public.course_schedules USING btree (id)`
- `CREATE INDEX course_schedules_user_day_idx ON public.course_schedules USING btree (user_id, day_of_week)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.

## course_session_topics

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| session_id | uuid | NO | - |
| course_id | uuid | NO | - |
| goal_id | uuid | NO | - |
| topic_id | uuid | NO | - |
| emphasis | smallint | YES | - |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `course_session_topics_course_id_not_null`: `NOT NULL course_id`
- `course_session_topics_created_at_not_null`: `NOT NULL created_at`
- `course_session_topics_emphasis_check`: `CHECK (((emphasis >= 1) AND (emphasis <= 5)))`
- `course_session_topics_goal_id_course_id_user_id_fkey`: `FOREIGN KEY (goal_id, course_id, user_id) REFERENCES learning_goals(id, course_id, user_id) DEFERRABLE`
- `course_session_topics_goal_id_not_null`: `NOT NULL goal_id`
- `course_session_topics_id_not_null`: `NOT NULL id`
- `course_session_topics_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `course_session_topics_metadata_not_null`: `NOT NULL metadata`
- `course_session_topics_pkey`: `PRIMARY KEY (id)`
- `course_session_topics_session_id_course_id_user_id_fkey`: `FOREIGN KEY (session_id, course_id, user_id) REFERENCES course_sessions(id, course_id, user_id) ON DELETE CASCADE`
- `course_session_topics_session_id_not_null`: `NOT NULL session_id`
- `course_session_topics_session_id_topic_id_key`: `UNIQUE (session_id, topic_id)`
- `course_session_topics_topic_id_goal_id_user_id_fkey`: `FOREIGN KEY (topic_id, goal_id, user_id) REFERENCES goal_topics(id, goal_id, user_id) DEFERRABLE`
- `course_session_topics_topic_id_not_null`: `NOT NULL topic_id`
- `course_session_topics_updated_at_not_null`: `NOT NULL updated_at`
- `course_session_topics_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `course_session_topics_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE INDEX course_session_topics_goal_idx ON public.course_session_topics USING btree (goal_id, course_id, user_id)`
- `CREATE UNIQUE INDEX course_session_topics_pkey ON public.course_session_topics USING btree (id)`
- `CREATE UNIQUE INDEX course_session_topics_session_id_topic_id_key ON public.course_session_topics USING btree (session_id, topic_id)`
- `CREATE INDEX course_session_topics_topic_idx ON public.course_session_topics USING btree (topic_id, goal_id, user_id)`
- `CREATE INDEX course_session_topics_user_idx ON public.course_session_topics USING btree (user_id)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.

## course_sessions

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| course_id | uuid | NO | - |
| session_date | date | NO | - |
| started_at | timestamp with time zone | YES | - |
| ended_at | timestamp with time zone | YES | - |
| pace | smallint | YES | - |
| memo | text | YES | - |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `course_sessions_check`: `CHECK (((ended_at IS NULL) OR ((started_at IS NOT NULL) AND (ended_at >= started_at))))`
- `course_sessions_course_id_not_null`: `NOT NULL course_id`
- `course_sessions_course_id_user_id_fkey`: `FOREIGN KEY (course_id, user_id) REFERENCES courses(id, user_id) DEFERRABLE`
- `course_sessions_created_at_not_null`: `NOT NULL created_at`
- `course_sessions_id_course_id_user_id_key`: `UNIQUE (id, course_id, user_id)`
- `course_sessions_id_not_null`: `NOT NULL id`
- `course_sessions_id_user_id_key`: `UNIQUE (id, user_id)`
- `course_sessions_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `course_sessions_metadata_not_null`: `NOT NULL metadata`
- `course_sessions_pace_check`: `CHECK (((pace >= 1) AND (pace <= 5)))`
- `course_sessions_pkey`: `PRIMARY KEY (id)`
- `course_sessions_session_date_not_null`: `NOT NULL session_date`
- `course_sessions_updated_at_not_null`: `NOT NULL updated_at`
- `course_sessions_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `course_sessions_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE INDEX course_sessions_course_date_idx ON public.course_sessions USING btree (course_id, user_id, session_date)`
- `CREATE UNIQUE INDEX course_sessions_id_course_id_user_id_key ON public.course_sessions USING btree (id, course_id, user_id)`
- `CREATE UNIQUE INDEX course_sessions_id_user_id_key ON public.course_sessions USING btree (id, user_id)`
- `CREATE UNIQUE INDEX course_sessions_pkey ON public.course_sessions USING btree (id)`
- `CREATE INDEX course_sessions_user_date_idx ON public.course_sessions USING btree (user_id, session_date)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.

## courses

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| name | text | NO | - |
| term | text | NO | - |
| professor | text | YES | - |
| credits | numeric(5,2) | YES | - |
| course_type | text | YES | - |
| catalog_source | text | YES | - |
| catalog_subject_id | text | YES | - |
| course_code | text | YES | - |
| registration_number | text | YES | - |
| location | text | YES | - |
| status | text | NO | 'active'::text |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `courses_created_at_not_null`: `NOT NULL created_at`
- `courses_credits_check`: `CHECK (((credits > (0)::numeric) AND (credits <= 999.99)))`
- `courses_id_not_null`: `NOT NULL id`
- `courses_id_user_id_key`: `UNIQUE (id, user_id)`
- `courses_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `courses_metadata_not_null`: `NOT NULL metadata`
- `courses_name_check`: `CHECK ((length(btrim(name)) > 0))`
- `courses_name_not_null`: `NOT NULL name`
- `courses_pkey`: `PRIMARY KEY (id)`
- `courses_registration_number_check`: `CHECK ((length(btrim(registration_number)) > 0))`
- `courses_status_check`: `CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'archived'::text])))`
- `courses_status_not_null`: `NOT NULL status`
- `courses_term_check`: `CHECK ((length(btrim(term)) > 0))`
- `courses_term_not_null`: `NOT NULL term`
- `courses_updated_at_not_null`: `NOT NULL updated_at`
- `courses_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `courses_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE UNIQUE INDEX courses_id_user_id_key ON public.courses USING btree (id, user_id)`
- `CREATE UNIQUE INDEX courses_pkey ON public.courses USING btree (id)`
- `CREATE UNIQUE INDEX courses_registration_unique ON public.courses USING btree (user_id, term, registration_number) WHERE (registration_number IS NOT NULL)`
- `CREATE INDEX courses_user_status_idx ON public.courses USING btree (user_id, status)`
- `CREATE INDEX courses_user_term_idx ON public.courses USING btree (user_id, term)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.

## goal_topics

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| goal_id | uuid | NO | - |
| parent_topic_id | uuid | YES | - |
| depth | smallint | NO | 1 |
| parent_depth | smallint | YES | ((depth - 1))::smallint |
| title | text | NO | - |
| position | integer | YES | - |
| status | text | NO | 'confirmed'::text |
| source_type | text | YES | - |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `goal_topics_check`: `CHECK ((((parent_topic_id IS NULL) AND (depth = 1)) OR ((parent_topic_id IS NOT NULL) AND (depth > 1))))`
- `goal_topics_check1`: `CHECK ((parent_topic_id IS DISTINCT FROM id))`
- `goal_topics_created_at_not_null`: `NOT NULL created_at`
- `goal_topics_depth_check`: `CHECK (((depth >= 1) AND (depth <= 3)))`
- `goal_topics_depth_not_null`: `NOT NULL depth`
- `goal_topics_goal_id_not_null`: `NOT NULL goal_id`
- `goal_topics_goal_id_user_id_fkey`: `FOREIGN KEY (goal_id, user_id) REFERENCES learning_goals(id, user_id) DEFERRABLE`
- `goal_topics_id_goal_id_user_id_depth_key`: `UNIQUE (id, goal_id, user_id, depth)`
- `goal_topics_id_goal_id_user_id_key`: `UNIQUE (id, goal_id, user_id)`
- `goal_topics_id_not_null`: `NOT NULL id`
- `goal_topics_id_user_id_key`: `UNIQUE (id, user_id)`
- `goal_topics_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `goal_topics_metadata_not_null`: `NOT NULL metadata`
- `goal_topics_parent_topic_id_goal_id_user_id_parent_depth_fkey`: `FOREIGN KEY (parent_topic_id, goal_id, user_id, parent_depth) REFERENCES goal_topics(id, goal_id, user_id, depth) DEFERRABLE`
- `goal_topics_pkey`: `PRIMARY KEY (id)`
- `goal_topics_position_check`: `CHECK (("position" >= 0))`
- `goal_topics_source_type_check`: `CHECK ((source_type = ANY (ARRAY['material_analysis'::text, 'user'::text, 'problem'::text, 'external'::text])))`
- `goal_topics_status_check`: `CHECK ((status = ANY (ARRAY['candidate'::text, 'confirmed'::text, 'archived'::text])))`
- `goal_topics_status_not_null`: `NOT NULL status`
- `goal_topics_title_check`: `CHECK ((length(btrim(title)) > 0))`
- `goal_topics_title_not_null`: `NOT NULL title`
- `goal_topics_updated_at_not_null`: `NOT NULL updated_at`
- `goal_topics_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `goal_topics_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE UNIQUE INDEX goal_topics_id_goal_id_user_id_depth_key ON public.goal_topics USING btree (id, goal_id, user_id, depth)`
- `CREATE UNIQUE INDEX goal_topics_id_goal_id_user_id_key ON public.goal_topics USING btree (id, goal_id, user_id)`
- `CREATE UNIQUE INDEX goal_topics_id_user_id_key ON public.goal_topics USING btree (id, user_id)`
- `CREATE INDEX goal_topics_parent_idx ON public.goal_topics USING btree (parent_topic_id, goal_id, user_id, parent_depth)`
- `CREATE UNIQUE INDEX goal_topics_pkey ON public.goal_topics USING btree (id)`
- `CREATE INDEX goal_topics_user_goal_idx ON public.goal_topics USING btree (user_id, goal_id)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.

## learning_goals

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| goal_type | text | NO | - |
| title | text | NO | - |
| course_id | uuid | YES | - |
| target_date | date | YES | - |
| importance | smallint | NO | 3 |
| status | text | NO | 'active'::text |
| completed_at | timestamp with time zone | YES | - |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `learning_goals_check`: `CHECK (((goal_type = 'course'::text) = (course_id IS NOT NULL)))`
- `learning_goals_check1`: `CHECK (((status <> 'completed'::text) OR (completed_at IS NOT NULL)))`
- `learning_goals_course_id_user_id_fkey`: `FOREIGN KEY (course_id, user_id) REFERENCES courses(id, user_id) DEFERRABLE`
- `learning_goals_course_owner_unique`: `UNIQUE (id, course_id, user_id)`
- `learning_goals_created_at_not_null`: `NOT NULL created_at`
- `learning_goals_goal_type_check`: `CHECK ((goal_type = ANY (ARRAY['course'::text, 'certification'::text, 'personal'::text])))`
- `learning_goals_goal_type_not_null`: `NOT NULL goal_type`
- `learning_goals_id_not_null`: `NOT NULL id`
- `learning_goals_id_user_id_key`: `UNIQUE (id, user_id)`
- `learning_goals_importance_check`: `CHECK (((importance >= 1) AND (importance <= 5)))`
- `learning_goals_importance_not_null`: `NOT NULL importance`
- `learning_goals_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `learning_goals_metadata_not_null`: `NOT NULL metadata`
- `learning_goals_pkey`: `PRIMARY KEY (id)`
- `learning_goals_status_check`: `CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text, 'archived'::text])))`
- `learning_goals_status_not_null`: `NOT NULL status`
- `learning_goals_title_check`: `CHECK ((length(btrim(title)) > 0))`
- `learning_goals_title_not_null`: `NOT NULL title`
- `learning_goals_updated_at_not_null`: `NOT NULL updated_at`
- `learning_goals_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `learning_goals_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE UNIQUE INDEX learning_goals_course_owner_unique ON public.learning_goals USING btree (id, course_id, user_id)`
- `CREATE UNIQUE INDEX learning_goals_course_unique ON public.learning_goals USING btree (user_id, course_id) WHERE (course_id IS NOT NULL)`
- `CREATE UNIQUE INDEX learning_goals_id_user_id_key ON public.learning_goals USING btree (id, user_id)`
- `CREATE UNIQUE INDEX learning_goals_pkey ON public.learning_goals USING btree (id)`
- `CREATE INDEX learning_goals_user_status_idx ON public.learning_goals USING btree (user_id, status)`
- `CREATE INDEX learning_goals_user_target_idx ON public.learning_goals USING btree (user_id, target_date)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.

## recurring_commitments

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| title | text | NO | - |
| commitment_type | text | NO | 'other'::text |
| day_of_week | smallint | NO | - |
| start_time | time without time zone | NO | - |
| end_time | time without time zone | NO | - |
| effective_from | date | YES | - |
| effective_to | date | YES | - |
| is_blocking | boolean | NO | true |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `recurring_commitments_check`: `CHECK ((start_time < end_time))`
- `recurring_commitments_check1`: `CHECK (((effective_from IS NULL) OR (effective_to IS NULL) OR (effective_from <= effective_to)))`
- `recurring_commitments_commitment_type_check`: `CHECK ((commitment_type = ANY (ARRAY['work'::text, 'appointment'::text, 'other'::text])))`
- `recurring_commitments_commitment_type_not_null`: `NOT NULL commitment_type`
- `recurring_commitments_created_at_not_null`: `NOT NULL created_at`
- `recurring_commitments_day_of_week_check`: `CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))`
- `recurring_commitments_day_of_week_not_null`: `NOT NULL day_of_week`
- `recurring_commitments_end_time_not_null`: `NOT NULL end_time`
- `recurring_commitments_id_not_null`: `NOT NULL id`
- `recurring_commitments_id_user_id_key`: `UNIQUE (id, user_id)`
- `recurring_commitments_is_blocking_not_null`: `NOT NULL is_blocking`
- `recurring_commitments_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `recurring_commitments_metadata_not_null`: `NOT NULL metadata`
- `recurring_commitments_pkey`: `PRIMARY KEY (id)`
- `recurring_commitments_start_time_not_null`: `NOT NULL start_time`
- `recurring_commitments_title_check`: `CHECK ((length(btrim(title)) > 0))`
- `recurring_commitments_title_not_null`: `NOT NULL title`
- `recurring_commitments_updated_at_not_null`: `NOT NULL updated_at`
- `recurring_commitments_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `recurring_commitments_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE UNIQUE INDEX recurring_commitments_id_user_id_key ON public.recurring_commitments USING btree (id, user_id)`
- `CREATE UNIQUE INDEX recurring_commitments_pkey ON public.recurring_commitments USING btree (id)`
- `CREATE INDEX recurring_commitments_user_day_idx ON public.recurring_commitments USING btree (user_id, day_of_week)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.

## study_methods

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| code | text | NO | - |
| category | text | NO | - |
| display_name | text | NO | - |
| description | text | YES | - |
| active | boolean | NO | true |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `study_methods_active_not_null`: `NOT NULL active`
- `study_methods_category_check`: `CHECK ((length(btrim(category)) > 0))`
- `study_methods_category_not_null`: `NOT NULL category`
- `study_methods_code_check`: `CHECK ((code ~ '^[a-z][a-z0-9_]*$'::text))`
- `study_methods_code_not_null`: `NOT NULL code`
- `study_methods_created_at_not_null`: `NOT NULL created_at`
- `study_methods_display_name_check`: `CHECK ((length(btrim(display_name)) > 0))`
- `study_methods_display_name_not_null`: `NOT NULL display_name`
- `study_methods_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `study_methods_metadata_not_null`: `NOT NULL metadata`
- `study_methods_pkey`: `PRIMARY KEY (code)`
- `study_methods_updated_at_not_null`: `NOT NULL updated_at`

Indexes:

- `CREATE UNIQUE INDEX study_methods_pkey ON public.study_methods USING btree (code)`

Row policies:

- study_methods_read (SELECT): USING `true`; WITH CHECK `-`.

## study_plan_items

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| plan_id | uuid | NO | - |
| goal_id | uuid | NO | - |
| topic_id | uuid | YES | - |
| method_code | text | NO | - |
| title | text | NO | - |
| planned_minutes | smallint | NO | - |
| scheduled_start | timestamp with time zone | YES | - |
| scheduled_end | timestamp with time zone | YES | - |
| priority_rank | integer | YES | - |
| reason | text | YES | - |
| completion_criteria | jsonb | NO | '{"schema_version": 1}'::jsonb |
| status | text | NO | 'planned'::text |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `study_plan_items_check`: `CHECK ((((scheduled_start IS NULL) AND (scheduled_end IS NULL)) OR ((scheduled_start IS NOT NULL) AND (scheduled_end IS NOT NULL) AND (scheduled_end > scheduled_start) AND (EXTRACT(epoch FROM (scheduled_end - scheduled_start)) >= ((planned_minutes * 60))::numeric))))`
- `study_plan_items_completion_criteria_check`: `CHECK (p0_valid_metadata(completion_criteria))`
- `study_plan_items_completion_criteria_not_null`: `NOT NULL completion_criteria`
- `study_plan_items_created_at_not_null`: `NOT NULL created_at`
- `study_plan_items_goal_id_not_null`: `NOT NULL goal_id`
- `study_plan_items_goal_id_user_id_fkey`: `FOREIGN KEY (goal_id, user_id) REFERENCES learning_goals(id, user_id) DEFERRABLE`
- `study_plan_items_id_goal_id_user_id_key`: `UNIQUE (id, goal_id, user_id)`
- `study_plan_items_id_not_null`: `NOT NULL id`
- `study_plan_items_id_user_id_key`: `UNIQUE (id, user_id)`
- `study_plan_items_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `study_plan_items_metadata_not_null`: `NOT NULL metadata`
- `study_plan_items_method_code_fkey`: `FOREIGN KEY (method_code) REFERENCES study_methods(code)`
- `study_plan_items_method_code_not_null`: `NOT NULL method_code`
- `study_plan_items_pkey`: `PRIMARY KEY (id)`
- `study_plan_items_plan_id_not_null`: `NOT NULL plan_id`
- `study_plan_items_plan_id_user_id_fkey`: `FOREIGN KEY (plan_id, user_id) REFERENCES study_plans(id, user_id) DEFERRABLE`
- `study_plan_items_planned_minutes_check`: `CHECK ((planned_minutes > 0))`
- `study_plan_items_planned_minutes_not_null`: `NOT NULL planned_minutes`
- `study_plan_items_priority_rank_check`: `CHECK ((priority_rank > 0))`
- `study_plan_items_status_check`: `CHECK ((status = ANY (ARRAY['planned'::text, 'completed'::text, 'skipped'::text, 'cancelled'::text])))`
- `study_plan_items_status_not_null`: `NOT NULL status`
- `study_plan_items_title_check`: `CHECK ((length(btrim(title)) > 0))`
- `study_plan_items_title_not_null`: `NOT NULL title`
- `study_plan_items_topic_id_goal_id_user_id_fkey`: `FOREIGN KEY (topic_id, goal_id, user_id) REFERENCES goal_topics(id, goal_id, user_id) DEFERRABLE`
- `study_plan_items_updated_at_not_null`: `NOT NULL updated_at`
- `study_plan_items_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `study_plan_items_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE INDEX study_plan_items_goal_topic_idx ON public.study_plan_items USING btree (goal_id, topic_id, user_id)`
- `CREATE UNIQUE INDEX study_plan_items_id_goal_id_user_id_key ON public.study_plan_items USING btree (id, goal_id, user_id)`
- `CREATE UNIQUE INDEX study_plan_items_id_user_id_key ON public.study_plan_items USING btree (id, user_id)`
- `CREATE UNIQUE INDEX study_plan_items_pkey ON public.study_plan_items USING btree (id)`
- `CREATE INDEX study_plan_items_plan_idx ON public.study_plan_items USING btree (plan_id, user_id)`
- `CREATE INDEX study_plan_items_topic_idx ON public.study_plan_items USING btree (topic_id, goal_id, user_id)`
- `CREATE INDEX study_plan_items_user_start_idx ON public.study_plan_items USING btree (user_id, scheduled_start)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.

## study_plans

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| source_type | text | NO | 'manual'::text |
| plan_horizon | text | NO | - |
| period_start | date | NO | - |
| period_end | date | NO | - |
| status | text | NO | 'draft'::text |
| parent_plan_id | uuid | YES | - |
| revision_no | integer | NO | 1 |
| parent_revision_no | integer | YES | (revision_no - 1) |
| idempotency_key | text | YES | - |
| request_metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| approved_at | timestamp with time zone | YES | - |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `study_plans_check`: `CHECK ((period_end >= period_start))`
- `study_plans_check1`: `CHECK (((plan_horizon <> 'daily'::text) OR (period_end = period_start)))`
- `study_plans_check2`: `CHECK ((((parent_plan_id IS NULL) AND (revision_no = 1)) OR ((parent_plan_id IS NOT NULL) AND (revision_no > 1))))`
- `study_plans_check3`: `CHECK ((parent_plan_id IS DISTINCT FROM id))`
- `study_plans_check4`: `CHECK (((status <> ALL (ARRAY['approved'::text, 'active'::text, 'completed'::text])) OR (approved_at IS NOT NULL)))`
- `study_plans_created_at_not_null`: `NOT NULL created_at`
- `study_plans_id_not_null`: `NOT NULL id`
- `study_plans_id_user_id_key`: `UNIQUE (id, user_id)`
- `study_plans_id_user_id_revision_no_key`: `UNIQUE (id, user_id, revision_no)`
- `study_plans_idempotency_key_check`: `CHECK ((length(btrim(idempotency_key)) > 0))`
- `study_plans_parent_plan_id_user_id_parent_revision_no_fkey`: `FOREIGN KEY (parent_plan_id, user_id, parent_revision_no) REFERENCES study_plans(id, user_id, revision_no) DEFERRABLE`
- `study_plans_period_end_not_null`: `NOT NULL period_end`
- `study_plans_period_start_not_null`: `NOT NULL period_start`
- `study_plans_pkey`: `PRIMARY KEY (id)`
- `study_plans_plan_horizon_check`: `CHECK ((plan_horizon = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'exam_period'::text, 'custom'::text])))`
- `study_plans_plan_horizon_not_null`: `NOT NULL plan_horizon`
- `study_plans_request_metadata_check`: `CHECK (p0_valid_metadata(request_metadata))`
- `study_plans_request_metadata_not_null`: `NOT NULL request_metadata`
- `study_plans_revision_no_check`: `CHECK ((revision_no > 0))`
- `study_plans_revision_no_not_null`: `NOT NULL revision_no`
- `study_plans_source_type_check`: `CHECK ((source_type = ANY (ARRAY['ai'::text, 'manual'::text, 'imported'::text])))`
- `study_plans_source_type_not_null`: `NOT NULL source_type`
- `study_plans_status_check`: `CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))`
- `study_plans_status_not_null`: `NOT NULL status`
- `study_plans_updated_at_not_null`: `NOT NULL updated_at`
- `study_plans_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `study_plans_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE UNIQUE INDEX study_plans_id_user_id_key ON public.study_plans USING btree (id, user_id)`
- `CREATE UNIQUE INDEX study_plans_id_user_id_revision_no_key ON public.study_plans USING btree (id, user_id, revision_no)`
- `CREATE UNIQUE INDEX study_plans_idempotency_unique ON public.study_plans USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)`
- `CREATE UNIQUE INDEX study_plans_pkey ON public.study_plans USING btree (id)`
- `CREATE UNIQUE INDEX study_plans_revision_unique ON public.study_plans USING btree (parent_plan_id, user_id) WHERE (parent_plan_id IS NOT NULL)`
- `CREATE INDEX study_plans_user_period_idx ON public.study_plans USING btree (user_id, period_start, status)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.

## study_sessions

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | - |
| plan_item_id | uuid | YES | - |
| goal_id | uuid | NO | - |
| topic_id | uuid | YES | - |
| method_code | text | YES | - |
| started_at | timestamp with time zone | YES | - |
| ended_at | timestamp with time zone | YES | - |
| actual_minutes | numeric(10,4) | NO | - |
| completion_status | text | NO | - |
| mastery_before | smallint | YES | - |
| mastery_after | smallint | YES | - |
| source | text | NO | 'manual'::text |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `study_sessions_actual_minutes_check`: `CHECK (((actual_minutes >= (0)::numeric) AND (actual_minutes < (1000000)::numeric)))`
- `study_sessions_actual_minutes_not_null`: `NOT NULL actual_minutes`
- `study_sessions_check`: `CHECK (((ended_at IS NULL) OR ((started_at IS NOT NULL) AND (ended_at >= started_at))))`
- `study_sessions_check1`: `CHECK (((source <> 'timer'::text) OR ((started_at IS NOT NULL) AND (ended_at IS NOT NULL))))`
- `study_sessions_check2`: `CHECK (((ended_at IS NULL) OR (actual_minutes <= round((EXTRACT(epoch FROM (ended_at - started_at)) / (60)::numeric), 4))))`
- `study_sessions_completion_status_check`: `CHECK ((completion_status = ANY (ARRAY['completed'::text, 'partial'::text, 'abandoned'::text])))`
- `study_sessions_completion_status_not_null`: `NOT NULL completion_status`
- `study_sessions_created_at_not_null`: `NOT NULL created_at`
- `study_sessions_goal_id_not_null`: `NOT NULL goal_id`
- `study_sessions_goal_id_user_id_fkey`: `FOREIGN KEY (goal_id, user_id) REFERENCES learning_goals(id, user_id) DEFERRABLE`
- `study_sessions_id_not_null`: `NOT NULL id`
- `study_sessions_id_user_id_key`: `UNIQUE (id, user_id)`
- `study_sessions_mastery_after_check`: `CHECK (((mastery_after >= 1) AND (mastery_after <= 5)))`
- `study_sessions_mastery_before_check`: `CHECK (((mastery_before >= 1) AND (mastery_before <= 5)))`
- `study_sessions_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `study_sessions_metadata_not_null`: `NOT NULL metadata`
- `study_sessions_method_code_fkey`: `FOREIGN KEY (method_code) REFERENCES study_methods(code)`
- `study_sessions_pkey`: `PRIMARY KEY (id)`
- `study_sessions_plan_item_id_goal_id_user_id_fkey`: `FOREIGN KEY (plan_item_id, goal_id, user_id) REFERENCES study_plan_items(id, goal_id, user_id) DEFERRABLE`
- `study_sessions_source_check`: `CHECK ((source = ANY (ARRAY['timer'::text, 'manual'::text, 'import'::text])))`
- `study_sessions_source_not_null`: `NOT NULL source`
- `study_sessions_topic_id_goal_id_user_id_fkey`: `FOREIGN KEY (topic_id, goal_id, user_id) REFERENCES goal_topics(id, goal_id, user_id) DEFERRABLE`
- `study_sessions_updated_at_not_null`: `NOT NULL updated_at`
- `study_sessions_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `study_sessions_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE INDEX study_sessions_goal_idx ON public.study_sessions USING btree (goal_id, user_id)`
- `CREATE UNIQUE INDEX study_sessions_id_user_id_key ON public.study_sessions USING btree (id, user_id)`
- `CREATE UNIQUE INDEX study_sessions_pkey ON public.study_sessions USING btree (id)`
- `CREATE INDEX study_sessions_plan_item_idx ON public.study_sessions USING btree (plan_item_id, goal_id, user_id)`
- `CREATE INDEX study_sessions_topic_start_idx ON public.study_sessions USING btree (topic_id, goal_id, user_id, started_at)`
- `CREATE INDEX study_sessions_user_start_idx ON public.study_sessions USING btree (user_id, started_at)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.

## user_preferences

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| user_id | uuid | NO | - |
| timezone | text | NO | 'Asia/Seoul'::text |
| default_block_minutes | smallint | NO | 30 |
| preferred_session_minutes | smallint | YES | - |
| min_break_minutes | smallint | NO | 10 |
| default_travel_buffer_minutes | smallint | NO | 0 |
| latest_study_end_time | time without time zone | YES | - |
| coaching_style | text | YES | - |
| metadata | jsonb | NO | '{"schema_version": 1}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Constraints:

- `user_preferences_created_at_not_null`: `NOT NULL created_at`
- `user_preferences_default_block_minutes_check`: `CHECK (((default_block_minutes >= 5) AND (default_block_minutes <= 180)))`
- `user_preferences_default_block_minutes_not_null`: `NOT NULL default_block_minutes`
- `user_preferences_default_travel_buffer_minutes_check`: `CHECK ((default_travel_buffer_minutes >= 0))`
- `user_preferences_default_travel_buffer_minutes_not_null`: `NOT NULL default_travel_buffer_minutes`
- `user_preferences_metadata_check`: `CHECK (p0_valid_metadata(metadata))`
- `user_preferences_metadata_not_null`: `NOT NULL metadata`
- `user_preferences_min_break_minutes_check`: `CHECK ((min_break_minutes >= 0))`
- `user_preferences_min_break_minutes_not_null`: `NOT NULL min_break_minutes`
- `user_preferences_pkey`: `PRIMARY KEY (user_id)`
- `user_preferences_preferred_session_minutes_check`: `CHECK ((preferred_session_minutes > 0))`
- `user_preferences_timezone_check`: `CHECK ((length(btrim(timezone)) > 0))`
- `user_preferences_timezone_not_null`: `NOT NULL timezone`
- `user_preferences_updated_at_not_null`: `NOT NULL updated_at`
- `user_preferences_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `user_preferences_user_id_not_null`: `NOT NULL user_id`

Indexes:

- `CREATE UNIQUE INDEX user_preferences_pkey ON public.user_preferences USING btree (user_id)`

Row policies:

- own_rows (ALL): USING `(( SELECT auth.uid() AS uid) = user_id)`; WITH CHECK `(( SELECT auth.uid() AS uid) = user_id)`.
