-- 대시보드 파일 자동 분류(file-classify)
-- 1) 사용자별 AI 분류 호출 한도(24시간 200회, 강의계획서 추출은 50회)
-- 2) 노트 파일 저장소에 PPTX·DOCX 허용
begin;

create table public.file_classification_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('classify','syllabus')),
  created_at timestamptz not null default now()
);
create index file_classification_usage_user_time on public.file_classification_usage(user_id, created_at desc);
alter table public.file_classification_usage enable row level security;
revoke all on public.file_classification_usage from public, anon, authenticated;
grant all on public.file_classification_usage to service_role;

create function public.reserve_file_classification(p_user uuid, p_mode text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_mode not in ('classify','syllabus') then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 34));
  if (select count(*) from public.file_classification_usage where user_id=p_user and created_at>now()-interval '24 hours') >= 200 then
    return false;
  end if;
  if p_mode = 'syllabus' and (select count(*) from public.file_classification_usage
      where user_id=p_user and mode='syllabus' and created_at>now()-interval '24 hours') >= 50 then
    return false;
  end if;
  insert into public.file_classification_usage(user_id, mode) values (p_user, p_mode);
  -- 오래된 기록 정리
  delete from public.file_classification_usage where user_id=p_user and created_at < now()-interval '7 days';
  return true;
end; $$;
revoke all on function public.reserve_file_classification(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_file_classification(uuid, text) to service_role;

update storage.buckets set allowed_mime_types = array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] where id = 'note-files';

commit;
