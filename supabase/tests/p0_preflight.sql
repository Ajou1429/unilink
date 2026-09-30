-- Read-only inventory. No user content or OAuth credentials are exported.
select jsonb_build_object(
  'captured_at', now(),
  'postgres_version', current_setting('server_version'),
  'migrations', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
  'counts', jsonb_build_object(
    'notes',(select count(*) from public.notes),
    'problem_bank_subjects',(select count(*) from public.problem_bank_subjects),
    'problem_bank_problems',(select count(*) from public.problem_bank_problems),
    'drive_connections',(select count(*) from public.drive_connections)),
  'tables', (select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
  'columns', (select jsonb_agg(to_jsonb(c) order by c.table_name,c.ordinal_position)
    from information_schema.columns c where c.table_schema='public'),
  'constraints', (select jsonb_agg(jsonb_build_object('table',c.relname,'name',con.conname,'definition',pg_get_constraintdef(con.oid)) order by c.relname,con.conname)
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'policies', (select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname) from pg_policies p where schemaname='public'),
  'indexes', (select jsonb_agg(to_jsonb(i) order by i.tablename,i.indexname) from pg_indexes i where schemaname='public')
) as inventory;
