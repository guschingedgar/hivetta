-- display names: own name settable from the web app only, visible to people you
-- share a workspace with, and shown by claim_view instead of the raw label. Rolled back.
do $t$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  w uuid; p uuid; n int; lbl text; r text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pa@test.dev', now()),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pb@test.dev', now()),
         (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pc@test.dev', now());

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  w := public.create_workspace('Names test');
  insert into public.projects (workspace_id, name) values (w, 'P') returning id into p;
  perform public.ingest_claims(p, 'pa@test.dev', 'm', 'c', 'claude', '{}', '[{"text":"Names show instead of emails.","type":"fact"}]');
  perform public.invite_member(w, 'pb@test.dev', 'viewer');

  insert into public.profiles (user_id, display_name) values (ua, 'Ada');
  select author_label into lbl from public.claim_view where project_id = p limit 1;
  r := r || E'\n[' || case when lbl = 'Ada' then 'ok' else 'FAIL' end || '] claim_view shows the name: ' || coalesce(lbl, 'null');
  select count(*) into n from public.sources where project_id = p and author_label = 'pa@test.dev';
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] raw provenance label unchanged';

  begin
    insert into public.profiles (user_id, display_name) values (ub, 'Impostor');
    r := r || E'\n[FAIL] set someone else''s name';
  exception when others then r := r || E'\n[ok] cannot set someone else''s name: ' || sqlstate; end;

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated', 'client_id', 'some-ai')::text, true);
  begin
    update public.profiles set display_name = 'Renamed by AI' where user_id = ua;
    get diagnostics n = row_count;
    r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] delegated token cannot rename (rows: ' || n || ')';
  exception when others then r := r || E'\n[ok] delegated token cannot rename: ' || sqlstate; end;

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  select count(*) into n from public.profiles where user_id = ua;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] teammate sees the name';
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  select count(*) into n from public.profiles where user_id = ua;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] outsider does not';

  raise exception 'RESULTS (rolled back):%', r;
end $t$;
