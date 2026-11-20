-- resolve_conflict: only a first-party project admin; winner accepted, loser
-- superseded (if accepted) or rejected (if proposed); "both" dismisses. Rolled back.
do $t$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  w uuid; p uuid; s uuid; a uuid; b uuid; c uuid; d uuid; f1 uuid; f2 uuid; f3 uuid; n int; r text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rc-a@test.dev', now()),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rc-b@test.dev', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  w := public.create_workspace('Resolve test');
  insert into public.projects (workspace_id, name) values (w, 'P') returning id into p;
  perform public.invite_member(w, 'rc-b@test.dev', 'contributor');
  select x.id into a from public.ingest_claims(p, 'rc-a@test.dev', 'm', 'c', 'claude', '{}', '[{"text":"Payments use Stripe Checkout.","type":"decision"}]') x;
  update public.claims set status = 'accepted' where id = a;
  select x.id into b from public.ingest_claims(p, 'rc-a@test.dev', 'm', 'c', 'claude', '{}', '[{"text":"Payments switch to PayPal.","type":"decision"}]') x;
  select x.id into c from public.ingest_claims(p, 'rc-a@test.dev', 'm', 'c', 'claude', '{}', '[{"text":"Launch is in March.","type":"fact"}]') x;
  select x.id into d from public.ingest_claims(p, 'rc-a@test.dev', 'm', 'c', 'claude', '{}', '[{"text":"Launch is in April.","type":"fact"}]') x;
  reset role;
  insert into public.conflicts (project_id, claim_a, claim_b, reason) values (p, least(a, b), greatest(a, b), 'Stripe vs PayPal') returning id into f1;
  insert into public.conflicts (project_id, claim_a, claim_b, reason) values (p, least(c, d), greatest(c, d), 'March vs April') returning id into f2;
  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated', 'client_id', 'chatgpt')::text, true);
  begin perform public.resolve_conflict(f1, b); r := r || E'\n[FAIL] assistant resolved a conflict';
  exception when others then r := r || E'\n[ok] assistant cannot resolve: ' || sqlstate; end;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  begin perform public.resolve_conflict(f1, b); r := r || E'\n[FAIL] non-admin resolved a conflict';
  exception when others then r := r || E'\n[ok] non-admin cannot resolve: ' || sqlstate; end;

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  begin perform public.resolve_conflict(f1, c); r := r || E'\n[FAIL] kept a claim outside the conflict';
  exception when others then r := r || E'\n[ok] kept claim must be in the conflict: ' || sqlstate; end;

  perform public.resolve_conflict(f1, b, 'PayPal fees are lower for us.');
  select count(*) into n from public.claims where id = b and status = 'accepted';
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] winner (proposed) accepted';
  select count(*) into n from public.claims where id = a and status = 'superseded' and superseded_by = b;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] accepted loser superseded by the winner';
  select count(*) into n from public.edges where from_claim = b and to_claim = a and type = 'supersedes' and actor_id = ua;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] supersedes edge records who and why';
  select count(*) into n from public.conflicts where id = f1 and status = 'resolved' and resolved_by = ua and resolution like 'PayPal%';
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] conflict resolved with the note';
  begin perform public.resolve_conflict(f1, a); r := r || E'\n[FAIL] resolved twice';
  exception when others then r := r || E'\n[ok] cannot resolve twice: ' || sqlstate; end;

  perform public.resolve_conflict(f2, null);
  select count(*) into n from public.claims where id in (c, d) and status = 'accepted';
  r := r || E'\n[' || case when n = 2 then 'ok' else 'FAIL' end || '] keep both: both accepted';
  select count(*) into n from public.conflicts where id = f2 and status = 'dismissed';
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] keep both: conflict dismissed';

  -- A proposed loser is rejected.
  select x.id into d from public.ingest_claims(p, 'rc-a@test.dev', 'm', 'c', 'claude', '{}', '[{"text":"Launch is in May.","type":"fact"}]') x;
  reset role;
  insert into public.conflicts (project_id, claim_a, claim_b, reason) values (p, least(c, d), greatest(c, d), 'March vs May') returning id into f3;
  set local role authenticated;
  perform public.resolve_conflict(f3, c);
  select count(*) into n from public.claims where id = d and status = 'rejected';
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] proposed loser rejected';

  raise exception 'RESULTS (rolled back):%', r;
end $t$;
