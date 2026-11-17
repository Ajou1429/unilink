begin;
alter table public.chat_conversations
  add column custom_title text check (custom_title is null or char_length(btrim(custom_title)) between 1 and 80),
  add column pinned boolean not null default false;
create policy chat_conversations_manage on public.chat_conversations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant update(custom_title,pinned) on public.chat_conversations to authenticated;
comment on column public.chat_conversations.custom_title is 'Explicit user title, independent of automatic conversation title.';
commit;
