begin;

-- Return a bounded HTTP conflict response instead of PostgREST retrying SQLSTATE 40001.
-- Direct SQL callers keep the original serialization failure and revision guards.
do $migration$
declare
  function_oid oid := 'public.save_chat_conversation(uuid,text,jsonb,integer)'::regprocedure;
  body text;
  replacement text;
begin
  select prosrc into body from pg_proc where oid = function_oid;
  if body like '%UNILINK_CHAT_HTTP_CONFLICT_V1%' then return; end if;
  replacement := regexp_replace(body, 'end;\s*$', $handler$
exception when serialization_failure then
  -- UNILINK_CHAT_HTTP_CONFLICT_V1
  if nullif(current_setting('request.method',true),'') is not null then
    raise sqlstate 'PGRST' using
      message=jsonb_build_object('code','40001','message',sqlerrm,'details',null,'hint',null)::text,
      detail='{"status":409,"headers":{}}';
  end if;
  raise;
end;
$handler$);
  if replacement = body then raise exception 'Unexpected chat conversation function body'; end if;
  execute replace(pg_get_functiondef(function_oid), body, replacement);
end $migration$;

commit;
