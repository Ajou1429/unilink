begin;

create table public.coaching_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null check (length(btrim(request_key)) between 1 and 200),
  intent text not null check (intent in ('weekly_plan','daily_plan','exam_prep','topic_review','progress_check')),
  status text not null default 'generating' check (status in (
    'generating','proposed','needs_input','no_capacity','progress_summary',
    'invalid','approved','rejected','expired','failed'
  )),
  request_payload jsonb not null check (public.p0_valid_metadata(request_payload)),
  context_snapshot jsonb not null check (public.p0_valid_metadata(context_snapshot)),
  output_payload jsonb check (output_payload is null or public.p0_valid_metadata(output_payload)),
  model_name text check (model_name is null or length(btrim(model_name)) > 0),
  prompt_version text check (prompt_version is null or length(btrim(prompt_version)) > 0),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  contract_version integer not null check (contract_version > 0),
  parent_run_id uuid,
  error_code text check (error_code is null or length(btrim(error_code)) > 0),
  error_message text check (error_message is null or length(btrim(error_message)) > 0),
  usage_payload jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(usage_payload)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  unique (id,user_id),
  unique (user_id,request_key),
  foreign key (parent_run_id,user_id) references public.coaching_runs(id,user_id) deferrable initially immediate,
  check (parent_run_id is distinct from id),
  check (expires_at > created_at),
  check (completed_at is null or completed_at >= created_at),
  check ((status = 'generating') = (completed_at is null)),
  check (status not in ('proposed','approved','rejected','progress_summary') or output_payload is not null),
  check (status <> 'failed' or error_code is not null)
);
create index coaching_runs_user_created_idx on public.coaching_runs(user_id,created_at desc);
create index coaching_runs_user_status_idx on public.coaching_runs(user_id,status,created_at desc);
create index coaching_runs_parent_idx on public.coaching_runs(parent_run_id,user_id) where parent_run_id is not null;
create index coaching_runs_expires_idx on public.coaching_runs(expires_at)
  where status in ('generating','proposed','needs_input','no_capacity','progress_summary');

create table public.coaching_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  plan_id uuid,
  replacement_run_id uuid,
  feedback_type text not null check (feedback_type in ('accepted','modified','rejected')),
  explanation text check (explanation is null or length(btrim(explanation)) > 0),
  payload jsonb not null default '{"schema_version":1}' check (public.p0_valid_metadata(payload)),
  event_key text not null check (length(btrim(event_key)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (id,user_id),
  unique (user_id,event_key),
  foreign key (run_id,user_id) references public.coaching_runs(id,user_id) deferrable initially immediate,
  foreign key (plan_id,user_id) references public.study_plans(id,user_id) deferrable initially immediate,
  foreign key (replacement_run_id,user_id) references public.coaching_runs(id,user_id) deferrable initially immediate,
  check (replacement_run_id is null or replacement_run_id is distinct from run_id),
  check (feedback_type <> 'modified' or replacement_run_id is not null)
);
create index coaching_feedback_run_idx on public.coaching_feedback(run_id,user_id,created_at);
create index coaching_feedback_plan_idx on public.coaching_feedback(plan_id,user_id,created_at) where plan_id is not null;
create index coaching_feedback_replacement_idx on public.coaching_feedback(replacement_run_id,user_id)
  where replacement_run_id is not null;

alter table public.coaching_runs enable row level security;
alter table public.coaching_feedback enable row level security;

revoke all on public.coaching_runs from public, anon, authenticated;
grant select on public.coaching_runs to authenticated;
grant all on public.coaching_runs to service_role;
create policy coaching_runs_select_own on public.coaching_runs
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.coaching_feedback from public, anon, authenticated;
grant select, insert on public.coaching_feedback to authenticated;
grant all on public.coaching_feedback to service_role;
create policy coaching_feedback_select_own on public.coaching_feedback
  for select to authenticated using ((select auth.uid()) = user_id);
create policy coaching_feedback_insert_own on public.coaching_feedback
  for insert to authenticated with check ((select auth.uid()) = user_id);

create trigger coaching_runs_updated_at before update on public.coaching_runs
  for each row execute function public.set_updated_at();

comment on table public.coaching_runs is
  'Durable, versioned coaching proposal records. Service code writes runs; users can read only their own rows.';
comment on column public.coaching_runs.request_key is
  'Stable user-scoped idempotency key. Reusing it with a different request must be rejected by service code.';
comment on column public.coaching_runs.context_snapshot is
  'Minimal versioned facts used for the proposal; do not copy credentials, raw Drive content, or unrelated metadata.';
comment on table public.coaching_feedback is
  'Immutable user feedback events for a coaching run, with optional same-owner plan and replacement-run references.';

commit;
