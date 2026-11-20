-- search_claims: drop weak meaning matches. Semantic search used to return the
-- N nearest claims whatever their distance, so any question listed (almost) the
-- whole project. Now a semantic hit must be within 0.12 cosine distance of the
-- best hit and under 0.75 overall. Keyword matches are unchanged. Same signature
-- and grants; function only, no data touched.
create or replace function public.search_claims(
  p_project_id uuid,
  p_query      text,
  p_embedding  extensions.vector(1536) default null,
  p_embedding_model text default null,
  p_types      text[] default null,
  p_statuses   text[] default array['proposed', 'accepted'],
  p_author_id  uuid default null,
  p_model      text default null,
  p_since      timestamptz default null,
  p_limit      int default 10
)
returns table (
  id            uuid,
  project_id    uuid,
  text          text,
  type          text,
  status        text,
  confidence    real,
  created_at    timestamptz,
  superseded_by uuid,
  source_id     uuid,
  author_id     uuid,
  author_label  text,
  model         text,
  client        text,
  recorded_at   timestamptz,
  score         double precision,
  matched_by    text
)
language sql stable security invoker set search_path = public, extensions as $$
  with params as (
    select least(greatest(coalesce(p_limit, 10), 1), 50) as lim,
           websearch_to_tsquery('english', coalesce(p_query, '')) as q
  ),
  filtered as (
    select c.id, c.embedding, c.embedding_model, c.fts
    from public.claims c
    join public.sources s on s.project_id = c.project_id and s.id = c.source_id
    where c.project_id = p_project_id
      and c.status = any (coalesce(p_statuses, array['proposed', 'accepted']))
      and (p_types is null or c.type = any (p_types))
      and (p_author_id is null or s.author_id = p_author_id)
      and (p_model is null or s.model = p_model)
      and (p_since is null or c.created_at >= p_since)
  ),
  near as (
    select f.id, (f.embedding <=> p_embedding) as dist
    from filtered f
    where p_embedding is not null and f.embedding is not null
      and f.embedding_model = p_embedding_model
    order by f.embedding <=> p_embedding
    limit (select lim * 4 from params)
  ),
  -- Only meaning matches close to the best one count: without this cut-off the
  -- nearest neighbours of any query are simply every claim in the project.
  vec as (
    select n.id, row_number() over (order by n.dist) as rnk
    from near n
    where n.dist <= least((select min(dist) from near) + 0.12, 0.75)
  ),
  kw as (
    select f.id, row_number() over (order by ts_rank_cd(f.fts, p.q) desc) as rnk
    from filtered f, params p
    where f.fts @@ p.q
    order by ts_rank_cd(f.fts, p.q) desc
    limit (select lim * 4 from params)
  ),
  fused as (
    select coalesce(v.id, k.id) as id,
           coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + k.rnk), 0) as score,
           case when v.id is not null and k.id is not null then 'both'
                when v.id is not null then 'semantic'
                else 'keyword' end as matched_by
    from vec v full outer join kw k on k.id = v.id
  )
  select cv.id, cv.project_id, cv.text, cv.type, cv.status, cv.confidence, cv.created_at,
         cv.superseded_by, cv.source_id, cv.author_id, cv.author_label, cv.model, cv.client,
         cv.recorded_at, fu.score::double precision, fu.matched_by
  from fused fu
  join public.claim_view cv on cv.id = fu.id
  order by fu.score desc, cv.created_at desc
  limit (select lim from params)
$$;

