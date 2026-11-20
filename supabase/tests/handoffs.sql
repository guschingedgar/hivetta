-- Handoffs: assistants (delegated tokens) can create them with claims in one
-- transaction; provenance cannot be forged; project-scoped; append-only.
-- Runs in one transaction and rolls back.
do $t$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  w uuid; p uuid; h uuid; c uuid; s_other uuid; n int; r text := '';
  delegated text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ho-a@test.dev', now()),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ho-b@test.dev', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  w := public.create_workspace('Handoff test');
  insert into public.projects (workspace_id, name) values (w, 'P') returning id into p;
  perform public.invite_member(w, 'ho-b@test.dev', 'viewer');

  -- A's assistant hands off, with two claims.
  delegated := json_build_object('sub', ua, 'role', 'authenticated', 'client_id', 'chatgpt')::text;
  perform set_config('request.jwt.claims', delegated, true);
  select x.handoff_id into h from public.create_handoff(
    p, 'ho-a@test.dev', 'claude-opus-5-5', 'claude-ai', 'chatgpt', '{}',
    'Payments module', 'payments', 'ho-b@test.dev',
    'Stripe Checkout works end to end in test mode; webhooks are not wired yet.',
    array['Wire the checkout.session.completed webhook'],
    '[{"label":"Repo","url":"https://github.com/acme/shop"}]',
    '[{"text":"The shop takes payments with Stripe Checkout to keep PCI scope small.","type":"decision"},
      {"text":"Should refunds be automated in the first release?","type":"open_question"}]') x limit 1;
  r := r || E'\n[' || case when h is not null then 'ok' else 'FAIL' end || '] delegated token creates a handoff';
  select count(*) into n from public.handoff_claims hc join public.claims cl on cl.id = hc.claim_id
    where hc.handoff_id = h and cl.status = 'proposed';
  r := r || E'\n[' || case when n = 2 then 'ok' else 'FAIL' end || '] its 2 claims are stored as proposed and linked';
  select count(*) into n from public.handoffs ho join public.sources s on s.id = ho.source_id
    where ho.id = h and s.author_id = ua and s.model = 'claude-opus-5-5';
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] provenance recorded (author from token, model)';

  -- No claims is fine too.
  select x.handoff_id into c from public.create_handoff(
    p, 'ho-a@test.dev', 'm', 'c', null, '{}', 'Docs handoff', null, null,
    'The onboarding guide is drafted in the docs folder and needs review.', '{}', '[]', '[]') x limit 1;
  r := r || E'\n[' || case when c is not null then 'ok' else 'FAIL' end || '] handoff without claims';

  -- B is a viewer: can read, cannot create.
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  select count(*) into n from public.handoffs where project_id = p;
  r := r || E'\n[' || case when n = 2 then 'ok' else 'FAIL' end || '] viewer reads handoffs: ' || n;
  begin
    perform public.create_handoff(p, 'ho-b@test.dev', 'm', 'c', null, '{}', 'Nope', null, null,
      'A viewer should not be able to create this handoff.', '{}', '[]', '[]');
    r := r || E'\n[FAIL] viewer created a handoff';
  exception when others then r := r || E'\n[ok] viewer cannot create: ' || sqlstate; end;

  -- A handoff cannot be attached to someone else's source (forged provenance).
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  select source_id into s_other from public.handoffs where id = h;
  reset role;
  update public.members set role = 'contributor' where workspace_id = w and user_id = ub;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  begin
    insert into public.handoffs (project_id, source_id, title, summary)
      values (p, s_other, 'Forged', 'Pretending Edgar wrote this handoff note.');
    r := r || E'\n[FAIL] forged-provenance handoff accepted';
  exception when others then r := r || E'\n[ok] forged provenance rejected: ' || sqlstate; end;

  -- Append-only, even for the author.
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  begin delete from public.handoffs where id = h; r := r || E'\n[FAIL] handoff deleted';
  exception when others then r := r || E'\n[ok] handoff cannot be deleted'; end;
  begin
    update public.handoffs set title = 'Rewritten' where id = h;
    get diagnostics n = row_count;
    r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] handoff cannot be edited (rows: ' || n || ')';
  exception when others then r := r || E'\n[ok] handoff cannot be edited: ' || sqlstate; end;

  -- Outsider sees nothing.
  reset role;
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ho-c@test.dev', now());
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
  select count(*) into n from public.handoffs where project_id = p;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] outsider sees no handoffs';
  select count(*) into n from public.handoff_claims where project_id = p;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] outsider sees no handoff links';

  raise exception 'RESULTS (rolled back):%', r;
end $t$;
