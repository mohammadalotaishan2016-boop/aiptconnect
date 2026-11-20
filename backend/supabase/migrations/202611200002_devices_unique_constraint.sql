-- The login Edge Function uses upsert with onConflict: "user_id,device_id".
-- PostgreSQL requires a unique constraint for ON CONFLICT to work.
-- Without this constraint every upsert throws an error and login returns 500.

alter table public.devices
  add constraint devices_user_device_unique unique (user_id, device_id);
