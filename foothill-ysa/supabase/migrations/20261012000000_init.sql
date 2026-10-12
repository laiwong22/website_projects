-- Foothill YSA: texting + announcements database.
-- Run once in the Supabase SQL editor (or `supabase db push`).
--
-- Who can see what:
--   anyone (the public site)  -> sent public announcements, events, active groups
--   signed-in members         -> their own profile
--   admins / owner            -> everything (subscribers' phone numbers included)
--   edge functions            -> everything, via the service-role key (bypasses RLS)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- people who log in
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  name        text,
  role        text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin'));
$$;

-- Every new login gets a 'member' profile. An admin promotes them on the Admins tab.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins change roles; nobody can make or unmake the owner from the app
-- (the owner is set once with SQL, see SETUP.md).
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only admins can change roles';
    end if;
    if auth.uid() is not null and (old.role = 'owner' or new.role = 'owner') then
      raise exception 'The owner role can only be changed in the database';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------- groups
create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text,
  keyword      text unique check (keyword = upper(keyword) and keyword ~ '^[A-Z0-9]{2,15}$'),
  groupme_url  text,
  is_default   boolean not null default false,  -- the main ward list, pre-checked on the sign-up form
  is_active    boolean not null default true,
  sort         int not null default 100,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- subscribers (phone numbers)
create table public.subscribers (
  id                    uuid primary key default gen_random_uuid(),
  phone                 text not null unique check (phone ~ '^\+1[2-9][0-9]{9}$'),  -- E.164, US only
  name                  text,
  status                text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  token                 text not null unique default encode(gen_random_bytes(9), 'hex'),  -- personal manage/unsubscribe link
  source                text not null default 'web' check (source in ('web', 'text', 'admin')),
  last_confirm_sent_at  timestamptz,
  confirmed_at          timestamptz,
  unsubscribed_at       timestamptz,
  created_at            timestamptz not null default now()
);

create table public.memberships (
  subscriber_id  uuid not null references public.subscribers (id) on delete cascade,
  group_id       uuid not null references public.groups (id) on delete cascade,
  status         text not null default 'active' check (status in ('active', 'left', 'removed')),  -- removed = kicked by an admin
  joined_at      timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (subscriber_id, group_id)
);
create index memberships_group_idx on public.memberships (group_id) where status = 'active';

-- ---------------------------------------------------------------- outgoing texts / announcements
create table public.messages (
  id                  uuid primary key default gen_random_uuid(),
  title               text,                              -- headline on the website (optional)
  body                text not null check (length(body) between 1 and 1600),
  group_ids           uuid[] not null default '{}',
  status              text not null default 'draft'
                        check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'canceled')),
  scheduled_at        timestamptz,
  claimed_at          timestamptz,
  sent_at             timestamptz,
  is_public           boolean not null default true,     -- show on the website's Announcements page
  include_unsub_link  boolean not null default false,
  recipient_count     int,
  error               text,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now()
);
create index messages_due_idx on public.messages (scheduled_at) where status in ('scheduled', 'sending');

create table public.deliveries (
  message_id     uuid not null references public.messages (id) on delete cascade,
  subscriber_id  uuid not null references public.subscribers (id) on delete cascade,
  twilio_sid     text,
  status         text not null default 'queued' check (status in ('queued', 'failed')),
  error          text,
  created_at     timestamptz not null default now(),
  primary key (message_id, subscriber_id)
);

create view public.message_stats with (security_invoker = true) as
  select message_id,
         count(*) filter (where status = 'queued') as sent,
         count(*) filter (where status = 'failed') as failed
  from public.deliveries group by message_id;

-- Atomically hand due messages to one dispatcher run. A run that died mid-send
-- leaves 'sending' rows; they're picked up again after 3 minutes and finish
-- where they stopped (deliveries already made are skipped).
create or replace function public.claim_due_messages(only_id uuid default null)
returns setof public.messages
language sql security definer set search_path = public as $$
  update public.messages m
     set status = 'sending', claimed_at = now()
   where m.id in (
     select id from public.messages
      where (only_id is null or id = only_id)
        and ((status = 'scheduled' and scheduled_at <= now())
          or (status = 'sending' and claimed_at < now() - interval '3 minutes'))
      for update skip locked)
  returning m.*;
$$;
revoke execute on function public.claim_due_messages(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- inbox (texts people send to the number, and your replies)
create table public.inbox_messages (
  id             uuid primary key default gen_random_uuid(),
  phone          text not null,
  subscriber_id  uuid references public.subscribers (id) on delete set null,
  direction      text not null check (direction in ('in', 'out')),
  body           text not null,
  is_read        boolean not null default false,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index inbox_phone_idx on public.inbox_messages (phone, created_at desc);

-- ---------------------------------------------------------------- calendar (separate from texts)
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  location     text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index events_starts_idx on public.events (starts_at);

-- ---------------------------------------------------------------- row level security
alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.subscribers    enable row level security;
alter table public.memberships    enable row level security;
alter table public.messages       enable row level security;
alter table public.deliveries     enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.events         enable row level security;

create policy "own profile or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "admins edit profiles" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "edit own name" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "public sees active groups" on public.groups for select to anon, authenticated
  using (is_active or public.is_admin());
create policy "admins manage groups" on public.groups for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "public sees sent announcements" on public.messages for select to anon, authenticated
  using ((status = 'sent' and is_public) or public.is_admin());
create policy "admins manage messages" on public.messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "public sees events" on public.events for select to anon, authenticated using (true);
create policy "admins manage events" on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins only" on public.subscribers    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins only" on public.memberships    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins only" on public.deliveries     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins only" on public.inbox_messages for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- The public site only reads these columns of messages (not who wrote it, errors, etc.).
revoke select on public.messages from anon;
grant select (id, title, body, group_ids, status, is_public, sent_at, created_at) on public.messages to anon;

-- ---------------------------------------------------------------- starter groups
insert into public.groups (slug, name, description, keyword, is_default, sort) values
  ('ward',      'Foothill YSA Announcements', 'Ward news, activities and reminders for everyone.', 'WARD', true, 1),
  ('running',   'Running Group',   'Group runs and races. Chat happens in GroupMe.',    'RUN',       false, 10),
  ('reading',   'Reading Group',   'Book club picks and meetups. Chat happens in GroupMe.', 'READ', false, 20),
  ('scripture', 'Scripture Group', 'Scripture study nights. Chat happens in GroupMe.', 'SCRIPTURE', false, 30);
