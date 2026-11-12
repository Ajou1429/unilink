-- 문제은행 문항 본문
-- 1) 문항마다 본문(수식 포함 텍스트)·크롭 그림 경로·확인 필요 여부를 content(jsonb)로 둔다. 그림 파일은 note-files 저장소.
-- 2) AI 호출 한도에 문제 분석(problem, 24시간 400페이지)을 추가한다.
begin;

alter table public.problem_bank_problems add column content jsonb;
alter table public.problem_bank_problems add constraint problem_bank_problems_content_shape
  check (content is null or (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 65536));

alter table public.file_classification_usage drop constraint file_classification_usage_mode_check;
alter table public.file_classification_usage add constraint file_classification_usage_mode_check
  check (mode in ('classify','syllabus','chat','problem'));

create or replace function public.reserve_file_classification(p_user uuid, p_mode text) returns boolean
language plpgsql security definer set search_path='' as $$
declare cap integer;
begin
  if p_mode not in ('classify','syllabus','chat','problem') then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 34));
  if p_mode in ('chat','problem') then
    cap := case p_mode when 'chat' then 300 else 400 end;
    if (select count(*) from public.file_classification_usage
        where user_id=p_user and mode=p_mode and created_at>now()-interval '24 hours') >= cap then
      return false;
    end if;
  else
    if (select count(*) from public.file_classification_usage
        where user_id=p_user and mode in ('classify','syllabus') and created_at>now()-interval '24 hours') >= 200 then
      return false;
    end if;
    if p_mode = 'syllabus' and (select count(*) from public.file_classification_usage
        where user_id=p_user and mode='syllabus' and created_at>now()-interval '24 hours') >= 50 then
      return false;
    end if;
  end if;
  insert into public.file_classification_usage(user_id, mode) values (p_user, p_mode);
  delete from public.file_classification_usage where user_id=p_user and created_at < now()-interval '7 days';
  return true;
end; $$;
revoke all on function public.reserve_file_classification(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_file_classification(uuid, text) to service_role;

commit;
