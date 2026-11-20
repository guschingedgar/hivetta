-- Security advisor: pin forbid_update's search_path; keep pg_net out of public.
alter function app.forbid_update() set search_path = '';
drop extension if exists pg_net;
create extension pg_net schema extensions;
