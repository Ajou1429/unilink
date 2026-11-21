-- Public demo is isolated from account data. Only the service role can reserve usage.
create table if not exists public.demo_ai_usage (
  day date not null,
  visitor text not null,
  chats integer not null default 0 check (chats >= 0),
  plans integer not null default 0 check (plans >= 0),
  primary key (day, visitor)
);
alter table public.demo_ai_usage enable row level security;
revoke all on public.demo_ai_usage from anon, authenticated;

create or replace function public.reserve_demo_usage(p_visitor text, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Asia/Seoul')::date;
  row_usage public.demo_ai_usage;
  global_usage public.demo_ai_usage;
begin
  if p_visitor !~ '^[a-f0-9]{64}$' or p_kind not in ('status','chat','plan') then
    raise exception 'Invalid demo reservation';
  end if;
  -- Serialize both the per-network and global budget in one transaction.
  perform pg_advisory_xact_lock(461921);
  insert into public.demo_ai_usage(day,visitor) values(d,'global'),(d,p_visitor) on conflict do nothing;
  select * into row_usage from public.demo_ai_usage where day=d and visitor=p_visitor;
  select * into global_usage from public.demo_ai_usage where day=d and visitor='global';
  if p_kind='status' then
    return jsonb_build_object('allowed',true,'remaining',greatest(0,3-row_usage.plans),'day',d);
  end if;
  if (p_kind='chat' and (row_usage.chats>=60 or global_usage.chats>=1000))
     or (p_kind='plan' and (row_usage.plans>=3 or global_usage.plans>=100)) then
    return jsonb_build_object('allowed',false,'remaining',greatest(0,3-row_usage.plans),'day',d);
  end if;
  update public.demo_ai_usage set chats=chats+case when p_kind='chat' then 1 else 0 end,
    plans=plans+case when p_kind='plan' then 1 else 0 end
    where day=d and visitor in ('global',p_visitor);
  return jsonb_build_object('allowed',true,'remaining',greatest(0,3-row_usage.plans-case when p_kind='plan' then 1 else 0 end),'day',d);
end $$;
revoke all on function public.reserve_demo_usage(text,text) from public,anon,authenticated;
grant execute on function public.reserve_demo_usage(text,text) to service_role;
