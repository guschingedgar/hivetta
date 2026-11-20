-- Claims saved in the same call (same source: one propose_claims batch or one
-- handoff) were compared with each other. They are checked concurrently, so
-- each saw its siblings as "existing memory" and two compatible steps of one
-- plan were flagged as conflicting with each other. Ingest already rejects
-- duplicates within a batch, so siblings are now left out of the comparison.
create or replace function public.claim_neighbours(p_claim uuid, p_limit int default 12)
returns table (id uuid, type text, status text, text text, author_label text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with c as (
    select id, project_id, source_id, embedding, embedding_model from public.claims where id = p_claim
  )
  select n.id, n.type, n.status, n.text, s.author_label, n.created_at
  from c
  join public.claims n on n.project_id = c.project_id and n.id <> c.id and n.source_id <> c.source_id
  join public.sources s on s.project_id = n.project_id and s.id = n.source_id
  where n.status in ('accepted', 'proposed')
  order by
    case when c.embedding is not null and n.embedding is not null
              and n.embedding_model = c.embedding_model
         then n.embedding operator(extensions.<=>) c.embedding end asc nulls last,
    n.created_at desc
  limit greatest(1, least(p_limit, 50))
$$;
revoke all on function public.claim_neighbours(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_neighbours(uuid, int) to service_role;
