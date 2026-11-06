begin;
-- Non-secret, server-only setting; existing RLS and grants remain unchanged.
alter table public.coaching_service_settings add column synthesis_model text
  check (synthesis_model is null or length(btrim(synthesis_model)) between 1 and 100);
commit;
