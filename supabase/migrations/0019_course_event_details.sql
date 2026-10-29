begin;
alter table public.calendar_events
  add column description text not null default '' check (length(description) <= 10000),
  add column exam_scope text not null default '' check (length(exam_scope) <= 5000);
comment on column public.calendar_events.description is 'User-confirmed assignment instructions or course event details.';
comment on column public.calendar_events.exam_scope is 'User-confirmed exam coverage, supplied to study planning.';
commit;
