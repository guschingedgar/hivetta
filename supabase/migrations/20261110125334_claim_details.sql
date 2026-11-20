-- A memory can carry more than its one sentence: why (the reasoning, the
-- alternatives considered), details (context, numbers, edge cases) and links
-- (sources mentioned in the conversation). All optional, written by the
-- proposing assistant at save time, and immutable like the sentence itself.

create function app.valid_links(p text[]) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or (
    cardinality(p) between 1 and 10
    and not exists (
      select 1 from unnest(p) u
      where u is null or length(u) > 2000 or u !~* '^https?://[^\s]+$'
    )
  )
$$;

alter table public.claims
  add column rationale text check (rationale is null or length(trim(rationale)) between 1 and 4000),
  add column details   text check (details is null or length(trim(details)) between 1 and 4000),
  add column links     text[] check (app.valid_links(links));

grant insert (rationale, details, links) on public.claims to authenticated;

-- Same guard as before, plus the three new fields.
create or replace function app.claims_guard_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.project_id <> old.project_id or new.source_id <> old.source_id
     or new.text <> old.text or new.type <> old.type
     or new.confidence is distinct from old.confidence
     or new.created_at <> old.created_at
     or new.branch_id is distinct from old.branch_id
     or new.rationale is distinct from old.rationale
     or new.details is distinct from old.details
     or new.links is distinct from old.links then
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

-- Views gain the new columns (appended, so existing readers keep working).
create or replace view public.claim_view with (security_invoker = true) as
select
  c.id, c.project_id, c.text, c.type, c.status, c.confidence, c.created_at, c.superseded_by,
  c.source_id, s.author_id, s.author_label, s.model, s.client, s.created_at as recorded_at,
  c.branch_id, c.rationale, c.details, c.links
from public.claims c
join public.sources s on s.project_id = c.project_id and s.id = c.source_id
left join public.branches b on b.project_id = c.project_id and b.id = c.branch_id
where c.branch_id is null or b.status = 'merged';

create or replace view public.branch_claim_view with (security_invoker = true) as
select
  c.id, c.project_id, c.text, c.type, c.status, c.confidence, c.created_at, c.superseded_by,
  c.source_id, s.author_id, s.author_label, s.model, s.client, s.created_at as recorded_at,
  c.branch_id, b.name as branch_name, b.status as branch_status, c.rationale, c.details, c.links
from public.claims c
join public.sources s on s.project_id = c.project_id and s.id = c.source_id
join public.branches b on b.project_id = c.project_id and b.id = c.branch_id
where b.status <> 'merged';

-- ingest_claims reads the optional fields from each claim object. Empty strings
-- and empty link lists become null, so "nothing" is stored one way only.
create or replace function public.ingest_claims(
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
  insert into public.claims as c
    (project_id, source_id, text, type, confidence, embedding, embedding_model, branch_id, rationale, details, links)
  select p_project_id, v_source, x.text, x.type, x.confidence, x.embedding::extensions.vector, x.embedding_model, v_branch,
         nullif(trim(x.rationale), ''), nullif(trim(x.details), ''),
         case when cardinality(x.links) > 0 then x.links end
  from jsonb_to_recordset(p_claims)
    as x(text text, type text, confidence real, embedding text, embedding_model text,
         rationale text, details text, links text[])
  returning c.id, c.text;
end $$;
