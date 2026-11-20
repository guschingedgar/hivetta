-- Handoffs: a teammate's assistant hands their part of a project to someone
-- else. A handoff is a short state-of-play note (summary, next steps, links
-- to where the work lives) plus the claims recorded with it. The claims are
-- ordinary claims: same provenance, same AI checker, same lifecycle.
-- Same invariants as claims: provenance via sources, append-only, project-scoped.

create table public.handoffs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id),
  source_id   uuid not null,
  title       text not null check (length(trim(title)) between 3 and 120),
  area        text check (area is null or length(trim(area)) between 1 and 60),
  recipient   text check (recipient is null or length(trim(recipient)) between 1 and 200),
  summary     text not null check (length(trim(summary)) between 20 and 4000),
  next_steps  text[] not null default '{}' check (cardinality(next_steps) <= 20),
  links       jsonb not null default '[]'
              check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 20),
  created_at  timestamptz not null default now(),
  unique (project_id, id),
  foreign key (project_id, source_id) references public.sources (project_id, id)
);
create index handoffs_project_idx on public.handoffs (project_id, created_at desc);

create table public.handoff_claims (
  project_id  uuid not null,
  handoff_id  uuid not null,
  claim_id    uuid not null,
  position    int not null,
  primary key (handoff_id, claim_id),
  foreign key (project_id, handoff_id) references public.handoffs (project_id, id),
  foreign key (project_id, claim_id)   references public.claims (project_id, id)
);

alter table public.handoffs enable row level security;
alter table public.handoff_claims enable row level security;
revoke all on public.handoffs, public.handoff_claims from public, anon, authenticated;
grant select, insert (project_id, source_id, title, area, recipient, summary, next_steps, links)
  on public.handoffs to authenticated;
grant select, insert (project_id, handoff_id, claim_id, position) on public.handoff_claims to authenticated;

create policy handoffs_select on public.handoffs for select to authenticated
  using (app.has_project_role(project_id, 'viewer'));
-- Like claims: only on a source you authored, so provenance cannot be forged.
-- Delegated (assistant) tokens may create handoffs: it is a proposal, not a review.
create policy handoffs_insert on public.handoffs for insert to authenticated
  with check (
    app.has_project_role(project_id, 'contributor')
    and exists (
      select 1 from public.sources s
      where s.project_id = handoffs.project_id and s.id = handoffs.source_id
        and s.author_id = (select auth.uid())
    )
  );
create policy handoff_claims_select on public.handoff_claims for select to authenticated
  using (app.has_project_role(project_id, 'viewer'));
create policy handoff_claims_insert on public.handoff_claims for insert to authenticated
  with check (
    exists (
      select 1 from public.handoffs h join public.sources s
        on s.project_id = h.project_id and s.id = h.source_id
      where h.project_id = handoff_claims.project_id and h.id = handoff_claims.handoff_id
        and s.author_id = (select auth.uid())
    )
  );

create trigger handoffs_no_delete before delete on public.handoffs
  for each row execute function app.forbid_delete();
create trigger handoffs_immutable before update on public.handoffs
  for each row execute function app.forbid_update();
create trigger handoff_claims_no_delete before delete on public.handoff_claims
  for each row execute function app.forbid_delete();
create trigger handoff_claims_immutable before update on public.handoff_claims
  for each row execute function app.forbid_update();
create trigger handoffs_no_truncate before truncate on public.handoffs
  for each statement execute function app.forbid_delete();
create trigger handoff_claims_no_truncate before truncate on public.handoff_claims
  for each statement execute function app.forbid_delete();

-- One transaction: the source (provenance), the claims, the handoff, the links
-- between them. SECURITY INVOKER, so RLS and grants decide, as for ingest_claims.
create function public.create_handoff(
  p_project_id   uuid,
  p_author_label text,
  p_model        text,
  p_client       text,
  p_client_id    text,
  p_raw_payload  jsonb,
  p_title        text,
  p_area         text,
  p_recipient    text,
  p_summary      text,
  p_next_steps   text[],
  p_links        jsonb,
  p_claims       jsonb  -- [{ text, type, confidence?, embedding?, embedding_model? }], may be empty
)
returns table (handoff_id uuid, claim_id uuid, claim_text text)
language plpgsql security invoker set search_path = public, extensions as $$
declare
  v_source uuid;
  v_handoff uuid;
begin
  if jsonb_typeof(coalesce(p_claims, '[]')) <> 'array' then
    raise exception 'p_claims must be an array' using errcode = '22023';
  end if;

  insert into public.sources (project_id, author_id, author_label, model, client, client_id, raw_payload)
  values (p_project_id, auth.uid(), p_author_label, p_model, p_client, p_client_id, p_raw_payload)
  returning sources.id into v_source;

  insert into public.handoffs (project_id, source_id, title, area, recipient, summary, next_steps, links)
  values (p_project_id, v_source, trim(p_title), nullif(trim(p_area), ''), nullif(trim(p_recipient), ''),
          trim(p_summary), coalesce(p_next_steps, '{}'), coalesce(p_links, '[]'))
  returning handoffs.id into v_handoff;

  return query
  with new_claims as (
    insert into public.claims as c (project_id, source_id, text, type, confidence, embedding, embedding_model)
    select p_project_id, v_source, x.text, x.type, x.confidence, x.embedding::extensions.vector, x.embedding_model
    from jsonb_to_recordset(coalesce(p_claims, '[]'))
      as x(text text, type text, confidence real, embedding text, embedding_model text)
    returning c.id, c.text
  ), linked as (
    insert into public.handoff_claims (project_id, handoff_id, claim_id, position)
    select p_project_id, v_handoff, n.id, row_number() over ()
    from new_claims n
    returning handoff_claims.claim_id
  )
  select v_handoff, n.id, n.text from new_claims n
  union all
  select v_handoff, null::uuid, null::text where not exists (select 1 from new_claims);
end $$;

revoke all on function public.create_handoff from public, anon;
grant execute on function public.create_handoff to authenticated;
