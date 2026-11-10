begin;

update public.coaching_service_settings
set analysis_model = 'gpt-6.1-terra',
    research_model = 'gpt-6.1-terra',
    synthesis_model = 'gpt-6.1-terra',
    updated_at = now()
where singleton;

commit;
