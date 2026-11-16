begin;

-- PostgREST maps SQLSTATE 40001 to HTTP 500. A stale approval/edit is a
-- recoverable conflict, not a server outage. Keep the existing JSON error code
-- and direct SQL behavior while giving HTTP clients a non-retryable 409.
do $migration$
declare
  target text;
  function_oid oid;
  body text;
  replacement text;
begin
  foreach target in array array[
    'public.approve_coaching_proposal(uuid)',
    'public.set_chat_problem_levels(jsonb)',
    'public.postpone_coaching_plan_item(uuid,timestamp with time zone,uuid)'
  ] loop
    function_oid := target::regprocedure;
    select prosrc into body from pg_proc where oid=function_oid;
    if body like '%UNILINK_HTTP_CONFLICT_V1%' then
      raise exception 'Conflict response handler already exists: %',target;
    end if;
    replacement := regexp_replace(body, 'end;\s*$', $handler$
exception when serialization_failure then
  -- UNILINK_HTTP_CONFLICT_V1: PostgREST supplies request.method per transaction.
  if nullif(current_setting('request.method',true),'') is not null then
    raise sqlstate 'PGRST' using
      message=jsonb_build_object('code','40001','message',sqlerrm,'details',null,'hint',null)::text,
      detail='{"status":409,"headers":{}}';
  end if;
  raise;
end;
$handler$);
    if replacement=body then
      raise exception 'Unexpected conflict function body: %',target;
    end if;
    execute replace(pg_get_functiondef(function_oid),body,replacement);
  end loop;
end $migration$;

commit;
