-- T5: Add invitation_message column to both invitation tables.
-- Allows administrators to include a personal message in the invitation email.

alter table public.user_invitations
  add column if not exists invitation_message text;

alter table public.client_invitations
  add column if not exists invitation_message text;
