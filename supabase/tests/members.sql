-- removing people and cancelling invitations: admins only, from the web app, never yourself;
-- the removed person loses access, their memories stay. Rolled back.
do $t$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  w uuid; p uuid; n int; r text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ma@test.dev', now()),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mb@test.dev', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  w := public.create_workspace('Members test');
  insert into public.projects (workspace_id, name) values (w, 'P') returning id into p;
  perform public.invite_member(w, 'mb@test.dev', 'contributor');
  perform public.invite_member(w, 'later@test.dev', 'viewer');

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform public.ingest_claims(p, 'mb@test.dev', 'm', 'c', 'claude', '{}', '[{"text":"B saved this before leaving.","type":"fact"}]');
  delete from public.members where workspace_id = w and user_id = ua; get diagnostics n = row_count;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] contributor cannot remove the admin';

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated', 'client_id', 'ai')::text, true);
  delete from public.members where workspace_id = w and user_id = ub; get diagnostics n = row_count;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] an AI token cannot remove people';
  delete from public.invitations where workspace_id = w; get diagnostics n = row_count;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] an AI token cannot cancel invitations';

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  delete from public.members where workspace_id = w and user_id = ua; get diagnostics n = row_count;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] admin cannot remove themselves';
  delete from public.members where workspace_id = w and user_id = ub; get diagnostics n = row_count;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] admin removes a member';
  delete from public.invitations where workspace_id = w and email = 'later@test.dev'; get diagnostics n = row_count;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] admin cancels a pending invitation';
  select count(*) into n from public.claim_view where project_id = p;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] removed member''s memory stays';

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  select count(*) into n from public.claim_view where project_id = p;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] removed member no longer sees the project';

  reset role;
  select count(*) into n from public.audit_log where workspace_id = w and action in ('member.removed', 'invitation.cancelled');
  r := r || E'\n[' || case when n = 2 then 'ok' else 'FAIL' end || '] both recorded in the audit log';
  raise exception 'RESULTS (rolled back):%', r;
end $t$;
