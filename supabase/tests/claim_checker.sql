-- Proves only the trusted checker (service role) can record verdicts, that a
-- claim is judged once, and that the verdict log is immutable. Rolled back.
do $t$
declare u uuid := gen_random_uuid(); w uuid; p uuid; s uuid; c uuid; r text := ''; ok boolean; n int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chk@test.dev', now());
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  w := public.create_workspace('chk'); insert into public.projects (workspace_id, name) values (w, 'P') returning id into p;
  insert into public.sources (project_id, author_id, author_label, model, client, raw_payload) values (p, u, 'chk@test.dev', 'm', 'c', '{}') returning id into s;
  insert into public.claims (project_id, source_id, text, type) values (p, s, 'A claim the user wants auto-approved.', 'fact') returning id into c;
  begin perform public.apply_claim_verdict(c, 'new', null, 'self-approved', 'fake'); r := r || E'\n[FAIL] user can apply a verdict';
  exception when others then r := r || E'\n[ok] user cannot apply a verdict: ' || sqlstate; end;
  begin perform public.verify_checker_secret('guess'); r := r || E'\n[FAIL] user can probe the secret';
  exception when others then r := r || E'\n[ok] user cannot probe the secret: ' || sqlstate; end;
  begin perform public.claim_neighbours(c); r := r || E'\n[FAIL] user can call claim_neighbours';
  exception when others then r := r || E'\n[ok] user cannot call claim_neighbours: ' || sqlstate; end;
  begin insert into public.claim_checks (claim_id, project_id, verdict, reason, model) values (c, p, 'new', 'x', 'x'); r := r || E'\n[FAIL] user can write claim_checks';
  exception when others then r := r || E'\n[ok] user cannot write claim_checks: ' || sqlstate; end;
  reset role;
  ok := public.apply_claim_verdict(c, 'new', null, 'service verdict', 'test');
  r := r || E'\n[' || case when ok then 'ok' else 'FAIL' end || '] trusted checker applies verdict';
  ok := public.apply_claim_verdict(c, 'new', null, 'second verdict', 'test');
  r := r || E'\n[' || case when not ok then 'ok' else 'FAIL' end || '] second verdict ignored (judged once)';
  select count(*) into n from public.claims where id = c and status = 'accepted';
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] claim accepted';
  begin update public.claim_checks set reason = 'rewritten' where claim_id = c; r := r || E'\n[FAIL] verdict rewritten';
  exception when others then r := r || E'\n[ok] verdict log is immutable'; end;
  raise exception 'RESULTS (rolled back):%', r;
end $t$;
