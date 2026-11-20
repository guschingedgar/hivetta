-- Proves delegated (OAuth client) tokens are limited to read + propose, while
-- the same admin user keeps full rights in a first-party session. Rolled back.
do $t$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); w uuid; p uuid; c uuid; n int; r text := '';
  first_party text; delegated text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lp-a@test.dev', now()),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lp-b@test.dev', now());
  first_party := json_build_object('sub', ua, 'role', 'authenticated')::text;
  delegated   := json_build_object('sub', ua, 'role', 'authenticated', 'client_id', 'some-dcr-client')::text;

  perform set_config('request.jwt.claims', delegated, true);
  set local role authenticated;
  begin perform public.create_workspace('nope'); r := r || E'\n[FAIL] delegated create_workspace';
  exception when others then r := r || E'\n[ok] delegated create_workspace refused'; end;

  perform set_config('request.jwt.claims', first_party, true);
  w := public.create_workspace('W');
  insert into public.projects (workspace_id, name) values (w, 'P') returning id into p;

  perform set_config('request.jwt.claims', delegated, true);
  select id into c from public.ingest_claims(p, 'lp-a@test.dev', 'claude-opus-5-5', 'claude-ai', 'some-dcr-client', '{}',
    '[{"text":"Delegated tokens may propose claims like this one.","type":"fact"}]');
  r := r || E'\n[' || case when c is not null then 'ok' else 'FAIL' end || '] delegated propose works';
  select count(*) into n from public.claim_view where project_id = p;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] delegated read works: ' || n;

  update public.claims set status = 'accepted' where id = c;
  get diagnostics n = row_count;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] delegated accept blocked (rows updated: ' || n || ')';
  begin insert into public.projects (workspace_id, name) values (w, 'Q'); r := r || E'\n[FAIL] delegated create project';
  exception when others then r := r || E'\n[ok] delegated create project refused: ' || sqlstate; end;
  begin perform public.invite_member(w, 'lp-b@test.dev', 'admin'); r := r || E'\n[FAIL] delegated invite';
  exception when others then r := r || E'\n[ok] delegated invite refused'; end;

  perform set_config('request.jwt.claims', first_party, true);
  update public.claims set status = 'accepted' where id = c;
  get diagnostics n = row_count;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] first-party accept works';
  r := r || E'\n[ok] first-party invite -> ' || public.invite_member(w, 'lp-b@test.dev', 'viewer');

  raise exception 'RESULTS (rolled back):%', r;
end $t$;
