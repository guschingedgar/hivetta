-- Auto-save: a per-person setting the MCP server reads to tell that person's AI whether to save
-- on its own initiative ('off', to a draft branch, or straight to memory). Memories an AI saved
-- on its own carry auto = true in their source's raw payload; the read views expose it.
alter table public.profiles add column auto_save text not null default 'off'
  check (auto_save in ('off', 'drafts', 'memory'));
grant update (auto_save) on public.profiles to authenticated;

create or replace view public.claim_view with (security_invoker = true) as
select
  c.id, c.project_id, c.text, c.type, c.status, c.confidence, c.created_at, c.superseded_by,
  c.source_id, s.author_id, coalesce(pr.display_name, s.author_label) as author_label, s.model, s.client, s.created_at as recorded_at,
  c.branch_id, c.rationale, c.details, c.links,
  coalesce((s.raw_payload #>> '{input,auto}')::boolean, false) as auto_saved
from public.claims c
join public.sources s on s.project_id = c.project_id and s.id = c.source_id
left join public.branches b on b.project_id = c.project_id and b.id = c.branch_id
left join public.profiles pr on pr.user_id = s.author_id
where c.branch_id is null or b.status = 'merged';

create or replace view public.branch_claim_view with (security_invoker = true) as
select
  c.id, c.project_id, c.text, c.type, c.status, c.confidence, c.created_at, c.superseded_by,
  c.source_id, s.author_id, coalesce(pr.display_name, s.author_label) as author_label, s.model, s.client, s.created_at as recorded_at,
  c.branch_id, b.name as branch_name, b.status as branch_status, c.rationale, c.details, c.links,
  coalesce((s.raw_payload #>> '{input,auto}')::boolean, false) as auto_saved
from public.claims c
join public.sources s on s.project_id = c.project_id and s.id = c.source_id
join public.branches b on b.project_id = c.project_id and b.id = c.branch_id
left join public.profiles pr on pr.user_id = s.author_id
where b.status <> 'merged';
