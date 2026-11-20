-- Proves the three invariants against a live database, as two simulated users.
-- Everything runs in one transaction and ends by raising an exception that
-- carries the results, so nothing is ever left behind (deletes are forbidden,
-- so rollback is the only way to clean up). Every line should read [ok].
--
-- Run: paste into the Supabase SQL editor, or
--      psql "$DATABASE_URL" -f supabase/tests/invariants.sql

do $test$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  wa uuid; wb uuid; pa uuid; pb uuid; sa uuid; sb uuid; c1 uuid; c2 uuid;
  n int; r text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.dev', now()),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.dev', now());

  -- as B: own workspace, project and a claim
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  wb := public.create_workspace('B space');
  insert into public.projects (workspace_id, name) values (wb, 'B proj') returning id into pb;
  insert into public.sources (project_id, author_id, author_label, model, client, raw_payload)
    values (pb, ub, 'b@test.dev', 'gpt-5', 'chatgpt', '{}') returning id into sb;
  insert into public.claims (project_id, source_id, text, type)
    values (pb, sb, 'B secret: the launch date is March 3rd.', 'fact');

  -- as A
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  wa := public.create_workspace('A space');
  insert into public.projects (workspace_id, name) values (wa, 'A proj') returning id into pa;
  insert into public.sources (project_id, author_id, author_label, model, client, raw_payload)
    values (pa, ua, 'a@test.dev', 'claude-opus-5-5', 'claude-ai', '{}') returning id into sa;
  insert into public.claims (project_id, source_id, text, type)
    values (pa, sa, 'Billing will use Stripe Checkout to keep PCI scope minimal.', 'decision') returning id into c1;
  r := r || E'\n[ok] A inserts claim in own project';

  -- Invariant 3: no cross-project reads
  select count(*) into n from public.claims where project_id = pb;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] I3 A sees ' || n || ' of B''s claims';
  select count(*) into n from public.claim_view where project_id = pb;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] I3 A sees ' || n || ' rows of B in claim_view';
  select count(*) into n from public.search_claims(p_project_id => pb, p_query => 'launch date');
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] I3 search_claims on B returns ' || n;
  select count(*) into n from public.search_claims(p_project_id => pa, p_query => 'Stripe');
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] search_claims keyword hit on own project: ' || n;

  -- Invariant 3: no cross-project writes
  begin
    insert into public.claims (project_id, source_id, text, type) values (pa, sb, 'Cross project smuggle attempt.', 'fact');
    r := r || E'\n[FAIL] I3 cross-project source accepted';
  exception when others then r := r || E'\n[ok] I3 cross-project source rejected: ' || sqlstate; end;

  -- Invariant 1: provenance is required and cannot be forged
  begin
    insert into public.sources (project_id, author_id, author_label, model, client, raw_payload)
      values (pa, ub, 'b@test.dev', 'x', 'x', '{}');
    r := r || E'\n[FAIL] I1 forged author accepted';
  exception when others then r := r || E'\n[ok] I1 forged author rejected: ' || sqlstate; end;
  begin
    insert into public.sources (project_id, author_id, author_label, client, raw_payload)
      values (pa, ua, 'a@test.dev', 'x', '{}');
    r := r || E'\n[FAIL] I1 source without model accepted';
  exception when others then r := r || E'\n[ok] I1 source without model rejected: ' || sqlstate; end;

  -- clients cannot pre-accept on insert or rewrite text
  begin
    insert into public.claims (project_id, source_id, text, type, status) values (pa, sa, 'Sneaky pre-accepted claim.', 'fact', 'accepted');
    r := r || E'\n[FAIL] insert with status accepted';
  exception when others then r := r || E'\n[ok] insert with status rejected: ' || sqlstate; end;
  begin
    update public.claims set text = 'Rewritten history here.' where id = c1;
    r := r || E'\n[FAIL] text rewrite accepted';
  exception when others then r := r || E'\n[ok] text rewrite rejected: ' || sqlstate; end;
  begin
    update public.claims set rationale = 'Rewritten reasoning.' where id = c1;
    r := r || E'\n[FAIL] rationale rewrite accepted';
  exception when others then r := r || E'\n[ok] rationale rewrite rejected (client): ' || sqlstate; end;

  -- Invariant 2: no deletes
  begin
    delete from public.claims where id = c1;
    r := r || E'\n[FAIL] I2 user delete accepted';
  exception when others then r := r || E'\n[ok] I2 user delete rejected: ' || sqlstate; end;

  -- lifecycle
  update public.claims set status = 'accepted' where id = c1;
  r := r || E'\n[ok] admin accepts claim';
  begin
    update public.claims set status = 'proposed' where id = c1;
    r := r || E'\n[FAIL] accepted -> proposed allowed';
  exception when others then r := r || E'\n[ok] accepted -> proposed rejected: ' || sqlstate; end;

  insert into public.claims (project_id, source_id, text, type)
    values (pa, sa, 'Billing will use Stripe Payment Links instead of Checkout.', 'decision') returning id into c2;
  perform public.supersede_claim(c1, c2, 'Checkout needed a server; Payment Links do not.');
  select count(*) into n from public.claims where id = c1 and status = 'superseded' and superseded_by = c2;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] supersede_claim sets status+pointer';
  select count(*) into n from public.edges where from_claim = c2 and to_claim = c1 and type = 'supersedes' and actor_id = ua;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] supersede edge records who';

  -- roles: invite B as viewer; B reads but cannot write
  r := r || E'\n[ok] invite_member -> ' || public.invite_member(wa, 'B@test.dev', 'viewer');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  select count(*) into n from public.claim_view where project_id = pa;
  r := r || E'\n[' || case when n = 2 then 'ok' else 'FAIL' end || '] viewer B reads A project: ' || n;
  begin
    insert into public.sources (project_id, author_id, author_label, model, client, raw_payload)
      values (pa, ub, 'b@test.dev', 'gpt-5', 'chatgpt', '{}');
    r := r || E'\n[FAIL] viewer write accepted';
  exception when others then r := r || E'\n[ok] viewer write rejected: ' || sqlstate; end;

  -- as the table owner, which bypasses RLS: the triggers still hold
  reset role;
  begin
    delete from public.claims where id = c2;
    r := r || E'\n[FAIL] I2 superuser delete accepted';
  exception when others then r := r || E'\n[ok] I2 superuser delete rejected: ' || sqlerrm; end;
  begin
    update public.claims set status = 'superseded', superseded_by = c1 where id = c2;
    set constraints all immediate;
    r := r || E'\n[FAIL] supersede without edge accepted';
  exception when others then r := r || E'\n[ok] supersede without edge rejected: ' || sqlerrm; end;

  select count(*) into n from public.audit_log where workspace_id = wa;
  r := r || E'\n[info] audit_log rows for A: ' || n;
  select count(*) into n from app.outbox where payload->>'project_id' in (pa::text, pb::text);
  r := r || E'\n[' || case when n = 3 then 'ok' else 'FAIL' end || '] outbox rows: ' || n;

  raise exception 'RESULTS (rolled back):%', r;
end
$test$;
