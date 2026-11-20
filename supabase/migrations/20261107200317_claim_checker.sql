-- AI claim checker (phase 2). Every new claim is compared with its nearest
-- neighbours in the same project by a trusted Edge Function (check-claim):
--   new       -> claim is accepted automatically
--   duplicate -> `duplicates` edge to the existing claim; new claim rejected
--   conflict  -> `contradicts` edge + open `conflicts` row; claim stays
--                proposed until a human resolves it
-- Only the service role (the Edge Function) can record a verdict, so no
-- user's assistant can approve its own claims. Each claim is judged at most
-- once (claim_checks primary key), and every verdict is kept with its reason.

create extension if not exists pg_net;

-- The verdict log: why each claim was accepted, rejected or flagged.
create table public.claim_checks (
  claim_id    uuid primary key,
  project_id  uuid not null,
  verdict     text not null check (verdict in ('new', 'duplicate', 'conflict')),
  target_id   uuid,
  reason      text not null check (length(trim(reason)) between 1 and 1000),
  model       text not null,
  created_at  timestamptz not null default now(),
  foreign key (project_id, claim_id)  references public.claims (project_id, id),
  foreign key (project_id, target_id) references public.claims (project_id, id),
  check ((verdict = 'new') = (target_id is null))
);
alter table public.claim_checks enable row level security;
revoke all on public.claim_checks from public, anon, authenticated;
grant select on public.claim_checks to authenticated;
create policy claim_checks_select on public.claim_checks for select to authenticated
  using (app.has_project_role(project_id, 'viewer'));
create trigger claim_checks_no_delete before delete on public.claim_checks
  for each row execute function app.forbid_delete();
create function app.forbid_update() returns trigger
language plpgsql as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = '42501';
end $$;
create trigger claim_checks_immutable before update on public.claim_checks
  for each row execute function app.forbid_update();

-- The reason a conflict was opened, shown to the human who resolves it.
alter table public.conflicts add column reason text
  check (reason is null or length(trim(reason)) between 1 and 1000);

-- Nearest existing claims to compare against: same project, same embedding
-- model, active statuses; most recent ones when the claim has no vector.
create function public.claim_neighbours(p_claim uuid, p_limit int default 12)
returns table (id uuid, type text, status text, text text, author_label text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with c as (
    select id, project_id, embedding, embedding_model from public.claims where id = p_claim
  )
  select n.id, n.type, n.status, n.text, s.author_label, n.created_at
  from c
  join public.claims n on n.project_id = c.project_id and n.id <> c.id
  join public.sources s on s.project_id = n.project_id and s.id = n.source_id
  where n.status in ('accepted', 'proposed')
  order by
    case when c.embedding is not null and n.embedding is not null
              and n.embedding_model = c.embedding_model
         then n.embedding operator(extensions.<=>) c.embedding end asc nulls last,
    n.created_at desc
  limit greatest(1, least(p_limit, 50))
$$;

-- Apply a verdict atomically. Idempotent: a claim already judged, or no
-- longer proposed, is left alone and the call returns false.
create function public.apply_claim_verdict(
  p_claim uuid, p_verdict text, p_target uuid, p_reason text, p_model text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid;
  v_status text;
begin
  select project_id, status into v_project, v_status
    from public.claims where id = p_claim for update;
  if v_project is null or v_status <> 'proposed'
     or exists (select 1 from public.claim_checks where claim_id = p_claim) then
    return false;
  end if;

  insert into public.claim_checks (claim_id, project_id, verdict, target_id, reason, model)
    values (p_claim, v_project, p_verdict, case when p_verdict = 'new' then null else p_target end,
            trim(p_reason), p_model);

  if p_verdict = 'new' then
    update public.claims set status = 'accepted' where id = p_claim;
  elsif p_verdict = 'duplicate' then
    insert into public.edges (project_id, from_claim, to_claim, type, created_by, reason)
      values (v_project, p_claim, p_target, 'duplicates', 'reasoner', trim(p_reason));
    update public.claims set status = 'rejected' where id = p_claim;
  else
    insert into public.edges (project_id, from_claim, to_claim, type, created_by, reason)
      values (v_project, p_claim, p_target, 'contradicts', 'reasoner', trim(p_reason));
    insert into public.conflicts (project_id, claim_a, claim_b, reason)
      values (v_project, least(p_claim, p_target), greatest(p_claim, p_target), trim(p_reason))
      on conflict (claim_a, claim_b) do nothing;
  end if;
  return true;
end $$;

revoke all on function public.claim_neighbours(uuid, int) from public, anon, authenticated;
revoke all on function public.apply_claim_verdict(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_neighbours(uuid, int) to service_role;
grant execute on function public.apply_claim_verdict(uuid, text, uuid, text, text) to service_role;

-- Ring the checker for every new claim. pg_net sends after commit, so a
-- rolled-back insert never triggers a check. The shared secret lives in Vault.
create function app.claims_notify_checker() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets
    where name = 'checker_webhook_secret';
  if v_secret is null then
    return null; -- checker not configured: claims stay proposed for human review
  end if;
  perform net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/check-claim',
    body := jsonb_build_object('claim_id', i.id),
    headers := jsonb_build_object('content-type', 'application/json', 'x-checker-secret', v_secret),
    timeout_milliseconds := 30000
  ) from inserted i;
  return null;
end $$;

create trigger claims_notify_checker after insert on public.claims
  referencing new table as inserted
  for each statement execute function app.claims_notify_checker();
