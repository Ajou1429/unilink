begin;

create table public.chat_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  items jsonb not null default '[]'::jsonb,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_items_shape check (jsonb_typeof(items) = 'array'),
  constraint chat_items_count check (jsonb_array_length(items) between 1 and 2000),
  constraint chat_items_size check (octet_length(items::text) <= 2097152)
);
create index chat_conversations_recent on public.chat_conversations(user_id, updated_at desc, id desc);
alter table public.chat_conversations enable row level security;
create policy chat_conversations_read on public.chat_conversations for select to authenticated using (user_id = auth.uid());
create policy chat_conversations_delete on public.chat_conversations for delete to authenticated using (user_id = auth.uid());
revoke all on public.chat_conversations from anon, authenticated;
grant select, delete on public.chat_conversations to authenticated;

-- Compare revisions under a row lock: two devices cannot silently overwrite a conversation.
create function public.save_chat_conversation(p_id uuid, p_title text, p_items jsonb, p_revision integer)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare owner_id uuid := auth.uid(); current_revision integer;
begin
  if owner_id is null then raise exception 'Login required' using errcode = '42501'; end if;
  if p_revision is null or p_revision < 0 then raise exception 'Invalid revision'; end if;
  if p_revision = 0 then
    insert into public.chat_conversations(id,user_id,title,items)
    values(p_id,owner_id,p_title,p_items) on conflict(id) do nothing;
    if found then return 1; end if;
    raise exception 'Conversation changed; reload before saving' using errcode = '40001';
  end if;
  select revision into current_revision from public.chat_conversations
    where id=p_id and user_id=owner_id for update;
  if current_revision is null or current_revision <> p_revision then
    raise exception 'Conversation changed; reload before saving' using errcode = '40001';
  end if;
  update public.chat_conversations set title=p_title,items=p_items,revision=revision+1,updated_at=clock_timestamp()
    where id=p_id and user_id=owner_id;
  return current_revision+1;
end;
$$;
revoke all on function public.save_chat_conversation(uuid,text,jsonb,integer) from public, anon;
grant execute on function public.save_chat_conversation(uuid,text,jsonb,integer) to authenticated;

comment on table public.chat_conversations is 'Account-owned chat text and read-only action/plan snapshots. No file bytes, executable approvals, auth tokens or full PDF data.';
commit;
