-- Read-only audit: structural metadata and counts, never user records or secrets.
with names(name) as (values
 ('user_preferences'),('courses'),('course_schedules'),('learning_goals'),('goal_topics'),
 ('study_methods'),('calendar_events'),('recurring_commitments'),('course_sessions'),
 ('course_session_topics'),('study_plans'),('study_plan_items'),('study_sessions'))
select jsonb_build_object(
 'checked_at', now(),
 'tables', (select jsonb_agg(jsonb_build_object(
   'name', n.name, 'exists', c.oid is not null, 'rls', c.relrowsecurity,
   'anon_select', has_table_privilege('anon', c.oid, 'SELECT'),
   'anon_insert', has_table_privilege('anon', c.oid, 'INSERT'),
   'authenticated_truncate', has_table_privilege('authenticated', c.oid, 'TRUNCATE'),
   'policy_count', (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=n.name),
   'invalid_constraints', (select count(*) from pg_constraint k where k.conrelid=c.oid and not k.convalidated)
 ) order by n.name) from names n left join pg_class c on c.oid=to_regclass('public.'||n.name)),
 'counts', jsonb_build_object(
   'courses',(select count(*) from public.courses),
   'learning_goals',(select count(*) from public.learning_goals),
   'study_plans',(select count(*) from public.study_plans),
   'study_plan_items',(select count(*) from public.study_plan_items),
   'study_sessions',(select count(*) from public.study_sessions),
   'calendar_events',(select count(*) from public.calendar_events),
   'recurring_commitments',(select count(*) from public.recurring_commitments),
   'study_methods',(select count(*) from public.study_methods),
   'notes',(select count(*) from public.notes),
   'drive_connections',(select count(*) from public.drive_connections),
   'problem_bank_subjects',(select count(*) from public.problem_bank_subjects),
   'problem_bank_problems',(select count(*) from public.problem_bank_problems)),
 'orphan_plan_items', (select count(*) from public.study_plan_items i
   left join public.study_plans p on p.id=i.plan_id and p.user_id=i.user_id
   left join public.learning_goals g on g.id=i.goal_id and g.user_id=i.user_id
   where p.id is null or g.id is null),
 'bridge_without_record', (select count(*) from public.courses where metadata ? 'legacy_kind' and not metadata ? 'legacy_record')
) as audit;
