-- T5: User invitations
-- Administrator-only: invite a user by email with a specific role (administrator|client).
-- Token is stored only as a SHA-256 hash — the raw token is never persisted.
-- One active invitation per email at a time (partial unique index).

create table if not exists public.user_invitations (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null,
  role          text        not null check (role in ('administrator', 'client')),
  client_id     uuid        references public.clients(id) on delete restrict,
  max_devices   integer     not null default 1 check (max_devices between 1 and 10),
  token_hash    text        not null,
  expires_at    timestamptz not null default (now() + interval '7 days'),
  invited_by    uuid        not null references auth.users(id) on delete restrict,
  consumed_at   timestamptz,
  claimed_by    uuid        references auth.users(id) on delete set null,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid        references auth.users(id) on delete set null,
  updated_by    uuid        references auth.users(id) on delete set null
);

-- Only one active invitation per email at a time.
create unique index if not exists user_invitations_one_active_per_email
  on public.user_invitations (lower(email))
  where consumed_at is null and revoked_at is null;

-- Token hash must be globally unique.
create unique index if not exists user_invitations_token_hash_unique
  on public.user_invitations (token_hash);

-- Fast lookup for the admin invitation list.
create index if not exists user_invitations_invited_by_idx
  on public.user_invitations (invited_by);

create index if not exists user_invitations_expires_at_idx
  on public.user_invitations (expires_at)
  where consumed_at is null and revoked_at is null;

-- updated_at trigger (reuses the existing helper from earlier migrations).
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_updated_at_user_invitations'
      and tgrelid = 'public.user_invitations'::regclass
  ) then
    create trigger set_updated_at_user_invitations
      before update on public.user_invitations
      for each row execute function public.set_updated_at();
  end if;
end
$$;

-- RLS: browser clients never touch this table.
-- All reads/writes go through the invite-user Edge Function with service_role.
alter table public.user_invitations enable row level security;

-- Drop and recreate so the migration is idempotent.
drop policy if exists "service role full access on user_invitations" on public.user_invitations;

create policy "service role full access on user_invitations"
  on public.user_invitations
  for all
  to service_role
  using (true)
  with check (true);

-- Only service_role can query this table; revoke from public/authenticated.
revoke all on public.user_invitations from public, authenticated, anon;
grant all on public.user_invitations to service_role;
