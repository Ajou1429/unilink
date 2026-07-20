-- Store the Google account shown in the Drive integration card.
-- Existing connections will stay connected and can populate these fields by
-- reconnecting Google Drive.

alter table public.drive_connections
  add column if not exists account_email text,
  add column if not exists account_name text,
  add column if not exists account_photo_url text;
