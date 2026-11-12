-- 홈 채팅으로 진도·이해도 기록(chat-record)
-- 파일 분류 호출 한도 표에 대화 해석(chat)을 추가한다. 대화는 파일 분류 한도와 따로 24시간 300회.
begin;

alter table public.file_classification_usage drop constraint file_classification_usage_mode_check;
alter table public.file_classification_usage add constraint file_classification_usage_mode_check
  check (mode in ('classify','syllabus','chat'));

create or replace function public.reserve_file_classification(p_user uuid, p_mode text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_mode not in ('classify','syllabus','chat') then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 34));
  if p_mode = 'chat' then
    if (select count(*) from public.file_classification_usage
        where user_id=p_user and mode='chat' and created_at>now()-interval '24 hours') >= 300 then
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
