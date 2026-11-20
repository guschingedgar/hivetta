-- Removes the pre-embedding-model overload of search_claims, leaving the one
-- defined in 20261013192837. Function only: no table or data is affected.
-- Apply with `npx supabase db push` (or paste into the SQL editor).
drop function if exists public.search_claims(uuid, text, extensions.vector, text[], text[], uuid, text, timestamptz, int);
