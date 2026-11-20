-- Fix: infinite recursion in "administrators can read all profiles" policy.
--
-- The policy added in 202611190005 queries public.profiles from within a SELECT
-- policy ON public.profiles. PostgreSQL evaluates RLS policies on every row scan,
-- so the sub-select triggers the policy again → infinite recursion.
--
-- Error at login (42P17):
--   "infinite recursion detected in policy for relation \"profiles\""
--
-- Fix: drop the recursive policy entirely.
--
-- Impact: browser clients can still read their OWN profile row (the original
-- "profiles are visible to their owner" policy, using id = auth.uid(), remains).
-- Admin operations that need to list ALL profiles must use server-side API
-- routes with the service_role key, which bypasses RLS. This is the correct
-- security boundary — raw user data should never be directly accessible from
-- the browser client regardless of role.

drop policy if exists "administrators can read all profiles" on public.profiles;
