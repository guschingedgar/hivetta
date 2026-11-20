-- Writes one source and its claims in a single transaction, so a failed claim
-- insert can never leave an orphan source (which invariant 2 would make
-- permanent). SECURITY INVOKER: RLS, column grants and triggers all apply.
-- author_id is taken from the token, never from the caller.

create function public.ingest_claims(
  p_project_id   uuid,
  p_author_label text,
  p_model        text,
  p_client       text,
  p_client_id    text,
  p_raw_payload  jsonb,
  p_claims       jsonb  -- [{ text, type, confidence?, embedding?, embedding_model? }]
)
returns table (id uuid, text text)
language plpgsql security invoker set search_path = public, extensions as $$
declare v_source uuid;
begin
  if jsonb_typeof(p_claims) <> 'array' or jsonb_array_length(p_claims) = 0 then
    raise exception 'p_claims must be a non-empty array' using errcode = '22023';
  end if;

  insert into public.sources (project_id, author_id, author_label, model, client, client_id, raw_payload)
  values (p_project_id, auth.uid(), p_author_label, p_model, p_client, p_client_id, p_raw_payload)
  returning sources.id into v_source;

  return query
  insert into public.claims as c (project_id, source_id, text, type, confidence, embedding, embedding_model)
  select p_project_id, v_source, x.text, x.type, x.confidence, x.embedding::extensions.vector, x.embedding_model
  from jsonb_to_recordset(p_claims)
    as x(text text, type text, confidence real, embedding text, embedding_model text)
  returning c.id, c.text;
end $$;

revoke all on function public.ingest_claims from public, anon;
grant execute on function public.ingest_claims to authenticated;
