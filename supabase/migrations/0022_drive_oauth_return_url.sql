-- Keep the initiating frontend with the short-lived browser-bound OAuth state.
alter table public.oauth_states add column return_url text;
