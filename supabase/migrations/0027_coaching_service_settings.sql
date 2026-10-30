begin;
-- Non-secret application controls. API keys remain exclusively in Edge secrets.
create table public.coaching_service_settings (
  singleton boolean primary key default true check(singleton),
  knowledge_enabled boolean not null default false,
  research_enabled boolean not null default false,
  topic_check_enabled boolean not null default false,
  analysis_model text check(analysis_model is null or length(analysis_model) between 1 and 100),
  research_model text check(research_model is null or length(research_model) between 1 and 100),
  updated_at timestamptz not null default now()
);
insert into public.coaching_service_settings(singleton) values(true);
alter table public.coaching_service_settings enable row level security;
revoke all on public.coaching_service_settings from public,anon,authenticated;
grant all on public.coaching_service_settings to service_role;
commit;
