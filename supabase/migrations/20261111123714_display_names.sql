-- Display names. Each person picks a name the first time they sign in; it is
-- shown everywhere instead of their email. The raw provenance does not change:
-- sources.author_label (the email or id the MCP server recorded) stays as it
-- was written. The read views show the person's current name when they have
-- one and the original label otherwise, so old memories pick up the name too.
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- You can read your own name and the names of people you share a workspace with.
create function app.shares_workspace(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid()) or exists (
    select 1 from public.members a join public.members b on b.workspace_id = a.workspace_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  )
$$;
revoke all on function app.shares_workspace(uuid) from public;
grant execute on function app.shares_workspace(uuid) to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (app.shares_workspace(user_id));
-- Only the person, from the web app itself (not an AI's delegated token), sets their name.
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and app.is_first_party());
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid()) and app.is_first_party())
  with check (user_id = (select auth.uid()) and app.is_first_party());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (user_id, display_name) on public.profiles to authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;

create or replace view public.claim_view with (security_invoker = true) as
select
  c.id, c.project_id, c.text, c.type, c.status, c.confidence, c.created_at, c.superseded_by,
  c.source_id, s.author_id, coalesce(pr.display_name, s.author_label) as author_label, s.model, s.client, s.created_at as recorded_at,
  c.branch_id, c.rationale, c.details, c.links
from public.claims c
join public.sources s on s.project_id = c.project_id and s.id = c.source_id
left join public.branches b on b.project_id = c.project_id and b.id = c.branch_id
left join public.profiles pr on pr.user_id = s.author_id
where c.branch_id is null or b.status = 'merged';

create or replace view public.branch_claim_view with (security_invoker = true) as
select
  c.id, c.project_id, c.text, c.type, c.status, c.confidence, c.created_at, c.superseded_by,
  c.source_id, s.author_id, coalesce(pr.display_name, s.author_label) as author_label, s.model, s.client, s.created_at as recorded_at,
  c.branch_id, b.name as branch_name, b.status as branch_status, c.rationale, c.details, c.links
from public.claims c
join public.sources s on s.project_id = c.project_id and s.id = c.source_id
join public.branches b on b.project_id = c.project_id and b.id = c.branch_id
left join public.profiles pr on pr.user_id = s.author_id
where b.status <> 'merged';
