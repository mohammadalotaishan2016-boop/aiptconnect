-- Allow clients to be created with minimal data (via invitation flow).
-- The client fills in the remaining details after registration.

ALTER TABLE public.clients ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN client_type DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN address DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN country_id DROP NOT NULL;
