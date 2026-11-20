-- Branches: a draft space inside a project. Claims saved to an open branch
-- are kept out of the shared ("main") memory: claim_view, search and the
-- brief do not show them, and the AI checker does not judge them yet.
-- Merging a branch sends each of its claims through the checker against
-- main memory: new -> accepted, duplicate -> set aside, conflict -> a human
-- decides. The checker is the reviewer, so merging needs no review screen.
-- Same invariants: provenance, append-only, project-scoped.

create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id),
  name        text not null check (name ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,59}$'),
  git_branch  text check (git_branch is null or length(trim(git_branch)) between 1 and 200),
  status      text not null default 'open' check (status in ('open', 'merged', 'abandoned')),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  closed_by   uuid references auth.users(id) on delete set null,
  closed_at   timestamptz,
  unique (project_id, id),
  check ((status = 'open') = (closed_at is null))
);
create unique index branches_project_name_key on public.branches (project_id, lower(name));

alter table public.branches enable row level security;
revoke all on public.branches from public, anon, authenticated;
grant select on public.branches to authenticated;
create policy branches_select on public.branches for select to authenticated
  using (app.has_project_role(project_id, 'viewer'));
-- Created by ingest_claims (security invoker) as the caller; status changes
-- only through merge_branch / abandon_branch (security definer).
grant insert (project_id, name, git_branch) on public.branches to authenticated;
create policy branches_insert on public.branches for insert to authenticated
  with check (app.has_project_role(project_id, 'contributor') and created_by = (select auth.uid()));

create trigger branches_no_delete before delete on public.branches
  for each row execute function app.forbid_delete();
create trigger branches_no_truncate before truncate on public.branches
  for each statement execute function app.forbid_delete();

-- Only open -> merged | abandoned, once, with who and when; nothing else changes.
create function app.branches_guard_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.project_id <> old.project_id or new.name <> old.name
     or new.git_branch is distinct from old.git_branch or new.created_at <> old.created_at
     or new.created_by is distinct from old.created_by and new.created_by is not null then
    raise exception 'branch % is immutable except for being closed', old.id using errcode = '42501';
  end if;
  if new.status <> old.status and not (old.status = 'open' and new.status in ('merged', 'abandoned')) then
    raise exception 'illegal branch transition % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
create trigger branches_guard_update before update on public.branches
  for each row execute function app.branches_guard_update();

-- Claims know their branch (null = main). Set at insert only.
alter table public.claims add column branch_id uuid;
alter table public.claims add constraint claims_branch_fk
  foreign key (project_id, branch_id) references public.branches (project_id, id);
create index claims_branch_idx on public.claims (branch_id) where branch_id is not null;
grant insert (branch_id) on public.claims to authenticated;

-- A claim can only be added to an open branch.
create function app.claims_branch_open() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.branch_id is not null and not exists (
       select 1 from public.branches b where b.id = new.branch_id and b.status = 'open') then
    raise exception 'branch % is not open', new.branch_id using errcode = '23514';
  end if;
  return new;
end $$;
create trigger claims_branch_open before insert on public.claims
  for each row execute function app.claims_branch_open();

-- branch_id is immutable like the rest of a claim's content.
create or replace function app.claims_guard_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.project_id <> old.project_id or new.source_id <> old.source_id
     or new.text <> old.text or new.type <> old.type
     or new.confidence is distinct from old.confidence
     or new.created_at <> old.created_at
     or new.branch_id is distinct from old.branch_id then
    raise exception 'claim % is immutable: only status, superseded_by and embedding may change', old.id
      using errcode = '42501';
  end if;
  if new.status <> old.status and not (
       (old.status = 'proposed' and new.status in ('accepted', 'rejected', 'superseded'))
    or (old.status = 'accepted' and new.status = 'superseded')
    or (old.status in ('proposed', 'accepted') and new.status = 'retired'
        and coalesce(current_setting('app.memory_manager', true), '') = 'on')
  ) then
    raise exception 'illegal status transition % -> % for claim %', old.status, new.status, old.id
      using errcode = '23514';
  end if;
  if old.superseded_by is not null and new.superseded_by is distinct from old.superseded_by then
    raise exception 'claim % is already superseded', old.id using errcode = '23514';
  end if;
  return new;
end $$;

-- Main memory = claims not in a branch, or in a merged one. Every existing
-- read (brief, search, open questions, web app) goes through claim_view, so
-- drafts stay out of all of them. branch_id is appended for provenance.
create or replace view public.claim_view with (security_invoker = true) as
select
  c.id, c.project_id, c.text, c.type, c.status, c.confidence, c.created_at, c.superseded_by,
  c.source_id, s.author_id, s.author_label, s.model, s.client, s.created_at as recorded_at,
  c.branch_id
from public.claims c
join public.sources s on s.project_id = c.project_id and s.id = c.source_id
left join public.branches b on b.project_id = c.project_id and b.id = c.branch_id
where c.branch_id is null or b.status = 'merged';

-- Drafts: claims in branches that are not merged, with their branch.
create view public.branch_claim_view with (security_invoker = true) as
select
  c.id, c.project_id, c.text, c.type, c.status, c.confidence, c.created_at, c.superseded_by,
  c.source_id, s.author_id, s.author_label, s.model, s.client, s.created_at as recorded_at,
  c.branch_id, b.name as branch_name, b.status as branch_status
from public.claims c
join public.sources s on s.project_id = c.project_id and s.id = c.source_id
join public.branches b on b.project_id = c.project_id and b.id = c.branch_id
where b.status <> 'merged';
revoke all on public.branch_claim_view from public, anon, authenticated;
grant select on public.branch_claim_view to authenticated;

-- One place that rings the checker for a claim (doorbell secret in Vault).
create function app.request_claim_check(p_claim uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'checker_webhook_secret';
  if v_secret is null then return; end if; -- checker not configured: claim waits for a human
  perform net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/check-claim',
    body := jsonb_build_object('claim_id', p_claim),
    headers := jsonb_build_object('content-type', 'application/json', 'x-checker-secret', v_secret),
    timeout_milliseconds := 30000
  );
end $$;
revoke all on function app.request_claim_check(uuid) from public, anon, authenticated;

-- New claims in main are checked at once; drafts wait for their merge.
create or replace function app.claims_notify_checker() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.request_claim_check(i.id) from inserted i where i.branch_id is null;
  return null;
end $$;

-- Compare against main memory only: never against drafts of open branches,
-- never against claims saved in the same call or merged from the same branch.
create or replace function public.claim_neighbours(p_claim uuid, p_limit int default 12)
returns table (id uuid, type text, status text, text text, author_label text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with c as (
    select id, project_id, source_id, branch_id, embedding, embedding_model from public.claims where id = p_claim
  )
  select n.id, n.type, n.status, n.text, s.author_label, n.created_at
  from c
  join public.claims n on n.project_id = c.project_id and n.id <> c.id and n.source_id <> c.source_id
  join public.sources s on s.project_id = n.project_id and s.id = n.source_id
  left join public.branches nb on nb.id = n.branch_id
  where n.status in ('accepted', 'proposed')
    and (n.branch_id is null or nb.status = 'merged')
    and (c.branch_id is null or n.branch_id is distinct from c.branch_id)
  order by
    case when c.embedding is not null and n.embedding is not null
              and n.embedding_model = c.embedding_model
         then n.embedding operator(extensions.<=>) c.embedding end asc nulls last,
    n.created_at desc
  limit greatest(1, least(p_limit, 50))
$$;
revoke all on function public.claim_neighbours(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_neighbours(uuid, int) to service_role;

-- ingest_claims gains an optional branch: found by name (case-insensitive)
-- or created open. A merged or abandoned branch cannot receive claims.
drop function public.ingest_claims(uuid, text, text, text, text, jsonb, jsonb);
create function public.ingest_claims(
  p_project_id   uuid,
  p_author_label text,
  p_model        text,
  p_client       text,
  p_client_id    text,
  p_raw_payload  jsonb,
  p_claims       jsonb,
  p_branch       text default null,
  p_git_branch   text default null
)
returns table (id uuid, text text)
language plpgsql security invoker set search_path = public, extensions as $$
declare v_source uuid; v_branch uuid; v_status text;
begin
  if jsonb_typeof(p_claims) <> 'array' or jsonb_array_length(p_claims) = 0 then
    raise exception 'p_claims must be a non-empty array' using errcode = '22023';
  end if;

  if nullif(trim(p_branch), '') is not null then
    select b.id, b.status into v_branch, v_status from public.branches b
      where b.project_id = p_project_id and lower(b.name) = lower(trim(p_branch));
    if v_branch is null then
      insert into public.branches (project_id, name, git_branch)
        values (p_project_id, trim(p_branch), nullif(trim(p_git_branch), ''))
        returning branches.id into v_branch;
    elsif v_status <> 'open' then
      raise exception 'branch "%" is % and cannot receive claims; use a new branch name', trim(p_branch), v_status
        using errcode = '23514';
    end if;
  end if;

  insert into public.sources (project_id, author_id, author_label, model, client, client_id, raw_payload)
  values (p_project_id, auth.uid(), p_author_label, p_model, p_client, p_client_id, p_raw_payload)
  returning sources.id into v_source;

  return query
  insert into public.claims as c (project_id, source_id, text, type, confidence, embedding, embedding_model, branch_id)
  select p_project_id, v_source, x.text, x.type, x.confidence, x.embedding::extensions.vector, x.embedding_model, v_branch
  from jsonb_to_recordset(p_claims)
    as x(text text, type text, confidence real, embedding text, embedding_model text)
  returning c.id, c.text;
end $$;
revoke all on function public.ingest_claims(uuid, text, text, text, text, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.ingest_claims(uuid, text, text, text, text, jsonb, jsonb, text, text) to authenticated;

-- Merge: close the branch and send each of its claims to the checker against
-- main memory. Any contributor may merge, assistants included: merging is a
-- submission, the checker is the reviewer, conflicts still go to a human.
create function public.merge_branch(p_project_id uuid, p_name text)
returns table (branch_id uuid, claims_sent int)
language plpgsql security definer set search_path = '' as $$
declare v_branch uuid; v_status text; v_count int := 0; v_claim uuid; v_workspace uuid;
begin
  if not app.has_project_role(p_project_id, 'contributor') then
    raise exception 'branch not found or not permitted' using errcode = '42501';
  end if;
  select b.id, b.status into v_branch, v_status from public.branches b
    where b.project_id = p_project_id and lower(b.name) = lower(trim(p_name)) for update;
  if v_branch is null then
    raise exception 'branch not found or not permitted' using errcode = '42501';
  end if;
  if v_status <> 'open' then
    raise exception 'branch "%" is already %', trim(p_name), v_status using errcode = '23514';
  end if;

  update public.branches set status = 'merged', closed_by = auth.uid(), closed_at = now() where id = v_branch;
  for v_claim in select c.id from public.claims c where c.branch_id = v_branch and c.status = 'proposed' order by c.created_at loop
    perform app.request_claim_check(v_claim);
    v_count := v_count + 1;
  end loop;

  select workspace_id into v_workspace from public.projects where id = p_project_id;
  insert into public.audit_log (workspace_id, project_id, actor, action, target_table, target_id, payload)
    values (v_workspace, p_project_id, auth.uid(), 'branch.merged', 'branches', v_branch::text,
            jsonb_build_object('name', trim(p_name), 'claims_sent', v_count));
  return query select v_branch, v_count;
end $$;
revoke all on function public.merge_branch(uuid, text) from public, anon;
grant execute on function public.merge_branch(uuid, text) to authenticated;

-- Abandon: close a branch without merging. Its drafts stay (nothing is
-- deleted) but never enter main memory.
create function public.abandon_branch(p_project_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_branch uuid; v_status text; v_workspace uuid;
begin
  if not app.has_project_role(p_project_id, 'contributor') then
    raise exception 'branch not found or not permitted' using errcode = '42501';
  end if;
  select b.id, b.status into v_branch, v_status from public.branches b
    where b.project_id = p_project_id and lower(b.name) = lower(trim(p_name)) for update;
  if v_branch is null then
    raise exception 'branch not found or not permitted' using errcode = '42501';
  end if;
  if v_status <> 'open' then
    raise exception 'branch "%" is already %', trim(p_name), v_status using errcode = '23514';
  end if;
  update public.branches set status = 'abandoned', closed_by = auth.uid(), closed_at = now() where id = v_branch;
  select workspace_id into v_workspace from public.projects where id = p_project_id;
  insert into public.audit_log (workspace_id, project_id, actor, action, target_table, target_id, payload)
    values (v_workspace, p_project_id, auth.uid(), 'branch.abandoned', 'branches', v_branch::text,
            jsonb_build_object('name', trim(p_name)));
  return v_branch;
end $$;
revoke all on function public.abandon_branch(uuid, text) from public, anon;
grant execute on function public.abandon_branch(uuid, text) to authenticated;
