-- Tenant <-> owner messaging. One conversation per (space, tenant); the tenant
-- opens it and the owner replies. Only the two participants can read or write,
-- and new messages are delivered over Realtime (which applies the same RLS).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
    id bigint generated always as identity primary key,
    property_id bigint not null references public.add_business (property_id) on delete cascade,
    -- Filled in by conversation_open_guard() from add_business.owner_id.
    owner_dui varchar not null references public.users (dui),
    tenant_dui varchar not null default public.caller_dui() references public.users (dui),
    created_at timestamptz not null default now(),
    last_message_at timestamptz not null default now(),
    constraint conversations_property_tenant_key unique (property_id, tenant_dui),
    constraint conversations_distinct_parties check (owner_dui <> tenant_dui)
);

create table if not exists public.messages (
    id bigint generated always as identity primary key,
    conversation_id bigint not null references public.conversations (id) on delete cascade,
    sender_dui varchar not null default public.caller_dui() references public.users (dui),
    body text not null,
    created_at timestamptz not null default now(),
    read_at timestamptz,
    constraint messages_body_length check (char_length(body) <= 2000 and btrim(body) <> '')
);

create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index if not exists messages_sender_idx on public.messages (sender_dui);
create index if not exists conversations_owner_idx on public.conversations (owner_dui, last_message_at desc);
create index if not exists conversations_tenant_idx on public.conversations (tenant_dui, last_message_at desc);

-- ---------------------------------------------------------------------------
-- Grants: clients only touch the columns they own. owner_dui, timestamps and
-- last_message_at are set by the server.
-- ---------------------------------------------------------------------------
revoke all on public.conversations from anon, authenticated;
revoke all on public.messages from anon, authenticated;

grant select on public.conversations to authenticated;
grant insert (property_id, tenant_dui) on public.conversations to authenticated;

grant select on public.messages to authenticated;
grant insert (conversation_id, sender_dui, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Opening a conversation: the owner comes from the listing, never the client.
-- ---------------------------------------------------------------------------
create or replace function public.conversation_open_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner varchar;
    v_availability text;
begin
    select owner_id, availability into v_owner, v_availability
    from add_business where property_id = new.property_id;

    if v_owner is null then
        raise exception 'This space does not exist.' using errcode = '22023';
    end if;
    new.owner_dui := v_owner;

    if new.tenant_dui = v_owner then
        raise exception 'You can''t start a conversation about your own space.' using errcode = '22023';
    end if;

    if (select account_type from users where dui = new.tenant_dui) is distinct from 'business' then
        raise exception 'Only business accounts can contact an owner.' using errcode = '42501';
    end if;

    if v_availability is distinct from 'Available' and not exists (
        select 1 from contract c where c.property_id = new.property_id and c.tenant_dui = new.tenant_dui
    ) then
        raise exception 'This space is not available.' using errcode = '22023';
    end if;

    new.created_at := now();
    new.last_message_at := now();
    return new;
end;
$$;

revoke execute on function public.conversation_open_guard() from public, anon, authenticated;

drop trigger if exists conversations_open_guard on public.conversations;
create trigger conversations_open_guard before insert on public.conversations
for each row execute function public.conversation_open_guard();

-- ---------------------------------------------------------------------------
-- Messages: bump the conversation, and keep read_at one-way and server-timed.
-- ---------------------------------------------------------------------------
create or replace function public.message_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update conversations set last_message_at = new.created_at where id = new.conversation_id;
    return null;
end;
$$;

revoke execute on function public.message_touch_conversation() from public, anon, authenticated;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages
for each row execute function public.message_touch_conversation();

create or replace function public.message_read_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.read_at := coalesce(old.read_at, now());
    return new;
end;
$$;

revoke execute on function public.message_read_guard() from public, anon, authenticated;

drop trigger if exists messages_read_guard on public.messages;
create trigger messages_read_guard before update on public.messages
for each row execute function public.message_read_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Participants can read their conversations" on public.conversations;
create policy "Participants can read their conversations" on public.conversations
for select to authenticated
using ((select caller_dui()) in (owner_dui, tenant_dui));

drop policy if exists "Tenants can open a conversation" on public.conversations;
create policy "Tenants can open a conversation" on public.conversations
for insert to authenticated
with check (tenant_dui = (select caller_dui()));

drop policy if exists "Participants can read messages" on public.messages;
create policy "Participants can read messages" on public.messages
for select to authenticated
using (exists (
    select 1 from conversations c
    where c.id = conversation_id and (select caller_dui()) in (c.owner_dui, c.tenant_dui)
));

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages" on public.messages
for insert to authenticated
with check (
    sender_dui = (select caller_dui())
    and exists (
        select 1 from conversations c
        where c.id = conversation_id and (select caller_dui()) in (c.owner_dui, c.tenant_dui)
    )
);

drop policy if exists "Recipients can mark messages read" on public.messages;
create policy "Recipients can mark messages read" on public.messages
for update to authenticated
using (
    sender_dui <> (select caller_dui())
    and exists (
        select 1 from conversations c
        where c.id = conversation_id and (select caller_dui()) in (c.owner_dui, c.tenant_dui)
    )
)
with check (
    sender_dui <> (select caller_dui())
    and exists (
        select 1 from conversations c
        where c.id = conversation_id and (select caller_dui()) in (c.owner_dui, c.tenant_dui)
    )
);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
        alter publication supabase_realtime add table public.messages;
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inbox: property name and the other person's name even when the caller can't
-- read that listing or user row directly. Owners don't see a conversation until
-- its first message arrives. Names only -- no contact details.
-- ---------------------------------------------------------------------------
create or replace function public.my_conversations()
returns table (
    conversation_id bigint,
    property_id bigint,
    property_name text,
    my_role text,
    counterpart_dui varchar,
    counterpart_first_name text,
    counterpart_last_name text,
    last_message_at timestamptz,
    last_message_body text,
    last_message_sender_dui varchar,
    unread_count integer
)
language sql
stable
security definer
set search_path = public
as $$
    with me as (select caller_dui() as dui)
    select
        c.id,
        c.property_id,
        b.property_name,
        case when c.owner_dui = me.dui then 'owner' else 'tenant' end,
        u.dui,
        u.first_name,
        u.last_name,
        c.last_message_at,
        lm.body,
        lm.sender_dui,
        (select count(*)::int from messages m
         where m.conversation_id = c.id and m.read_at is null and m.sender_dui <> me.dui)
    from conversations c
    cross join me
    join add_business b on b.property_id = c.property_id
    join users u on u.dui = case when c.owner_dui = me.dui then c.tenant_dui else c.owner_dui end
    left join lateral (
        select m.body, m.sender_dui from messages m
        where m.conversation_id = c.id
        order by m.created_at desc, m.id desc
        limit 1
    ) lm on true
    where me.dui in (c.owner_dui, c.tenant_dui)
      and (c.tenant_dui = me.dui or lm.body is not null)
    order by c.last_message_at desc
$$;

revoke execute on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- ---------------------------------------------------------------------------
-- People you're chatting with become visible (first/last name, account type --
-- the existing column grants still apply).
-- ---------------------------------------------------------------------------
create or replace function public.visible_user_duis()
returns setof character varying
language sql
stable
security definer
set search_path = public
as $$
    with me as (select dui from users where id_supabase_auth = auth.uid())
    select dui from me
    union select b.owner_id from add_business b where b.availability = 'Available'
    union select c.tenant_dui from contract c join add_business b on b.property_id = c.property_id join me on b.owner_id = me.dui
    union select b.owner_id from contract c join add_business b on b.property_id = c.property_id join me on c.tenant_dui = me.dui
    union select n.sender_dui from notifications n join me on n.recipient_dui = me.dui where n.sender_dui is not null
    union select case when cv.owner_dui = me.dui then cv.tenant_dui else cv.owner_dui end
          from conversations cv join me on me.dui in (cv.owner_dui, cv.tenant_dui)
$$;
