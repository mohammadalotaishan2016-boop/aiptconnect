-- Add missing standard columns: created_by, updated_by.
-- All additions are nullable — existing rows cannot be backfilled.
-- Also adds updated_at + set_updated_at trigger to tables that were missing it.

-- ============================================================================
-- profiles  (updated_at + max_devices added in 202611190003; add audit columns)
-- ============================================================================
alter table public.profiles
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- ============================================================================
-- clients
-- ============================================================================
alter table public.clients
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- ============================================================================
-- projects
-- ============================================================================
alter table public.projects
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- ============================================================================
-- statements
-- ============================================================================
alter table public.statements
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- ============================================================================
-- quotations (created_by already exists; add updated_by)
-- ============================================================================
alter table public.quotations
  add column if not exists updated_by uuid;

-- ============================================================================
-- customer_service_tickets
-- ============================================================================
alter table public.customer_service_tickets
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- ============================================================================
-- audit_logs (append-only: only created_by makes sense)
-- ============================================================================
alter table public.audit_logs
  add column if not exists created_by uuid;

-- ============================================================================
-- notifications
-- ============================================================================
alter table public.notifications
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- ============================================================================
-- requirements
-- ============================================================================
alter table public.requirements
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- ============================================================================
-- news_feed
-- ============================================================================
alter table public.news_feed
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- ============================================================================
-- login_otp_challenges — add updated_at + trigger
-- ============================================================================
alter table public.login_otp_challenges
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists login_otp_challenges_set_updated_at on public.login_otp_challenges;
create trigger login_otp_challenges_set_updated_at
  before update on public.login_otp_challenges
  for each row execute procedure public.set_updated_at();

-- ============================================================================
-- client_invitations — add updated_at + trigger
-- ============================================================================
alter table public.client_invitations
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists client_invitations_set_updated_at on public.client_invitations;
create trigger client_invitations_set_updated_at
  before update on public.client_invitations
  for each row execute procedure public.set_updated_at();

-- ============================================================================
-- client_registration_claims — add updated_at + trigger
-- ============================================================================
alter table public.client_registration_claims
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists client_registration_claims_set_updated_at on public.client_registration_claims;
create trigger client_registration_claims_set_updated_at
  before update on public.client_registration_claims
  for each row execute procedure public.set_updated_at();
