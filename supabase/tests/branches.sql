-- Branches: drafts stay out of main memory until merged; merging hands each
-- claim to the checker; closed branches are final. Rolled back.
do $t$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  w uuid; p uuid; br uuid; main_claim uuid; draft uuid; n int; r text := ''; sent int;
  delegated text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'br-a@test.dev', now()),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'br-b@test.dev', now()),
         (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'br-c@test.dev', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  w := public.create_workspace('Branch test');
  insert into public.projects (workspace_id, name) values (w, 'P') returning id into p;
  perform public.invite_member(w, 'br-b@test.dev', 'viewer');

  delegated := json_build_object('sub', ua, 'role', 'authenticated', 'client_id', 'chatgpt')::text;
  perform set_config('request.jwt.claims', delegated, true);
  select x.id into main_claim from public.ingest_claims(p, 'br-a@test.dev', 'm', 'c', 'chatgpt', '{}',
    '[{"text":"The shop takes payments with Stripe Checkout.","type":"decision"}]') x;
  perform public.ingest_claims(p, 'br-a@test.dev', 'm', 'c', 'chatgpt', '{}',
    '[{"text":"The shop could switch payments to PayPal.","type":"decision"},
      {"text":"PayPal fees are lower for small orders in Europe.","type":"assumption"}]',
    'payments-v2', 'feature/paypal');
  select id into br from public.branches where project_id = p and name = 'payments-v2';
  r := r || E'\n[' || case when br is not null then 'ok' else 'FAIL' end || '] assistant creates a branch by saving to it';
  select count(*) into n from public.claims where branch_id = br and status = 'proposed';
  r := r || E'\n[' || case when n = 2 then 'ok' else 'FAIL' end || '] drafts stored in the branch: ' || n;
  select count(*) into n from public.claim_view where project_id = p;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] main memory hides drafts (claim_view rows: ' || n || ')';
  select count(*) into n from public.search_claims(p_project_id => p, p_query => 'PayPal');
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] search hides drafts';
  select count(*) into n from public.branch_claim_view where branch_id = br;
  r := r || E'\n[' || case when n = 2 then 'ok' else 'FAIL' end || '] drafts readable on purpose (branch_claim_view)';
  select id into draft from public.claims where branch_id = br limit 1;

  reset role;
  select count(*) into n from public.claim_neighbours(main_claim) x where x.id = draft;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] checker never compares main with open drafts';
  set local role authenticated;

  -- Viewer B: reads the branch, cannot merge or abandon.
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  select count(*) into n from public.branch_claim_view where branch_id = br;
  r := r || E'\n[' || case when n = 2 then 'ok' else 'FAIL' end || '] viewer reads drafts';
  begin perform public.merge_branch(p, 'payments-v2'); r := r || E'\n[FAIL] viewer merged';
  exception when others then r := r || E'\n[ok] viewer cannot merge: ' || sqlstate; end;
  begin update public.branches set status = 'merged', closed_at = now() where id = br;
    get diagnostics n = row_count;
    r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] branch status not writable directly';
  exception when others then r := r || E'\n[ok] branch status not writable directly: ' || sqlstate; end;

  -- Outsider C sees nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  select count(*) into n from public.branch_claim_view where project_id = p;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] outsider sees no drafts';
  select count(*) into n from public.branches where project_id = p;
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] outsider sees no branches';

  -- A's assistant merges (name is case-insensitive).
  perform set_config('request.jwt.claims', delegated, true);
  select x.claims_sent into sent from public.merge_branch(p, 'Payments-V2') x;
  r := r || E'\n[' || case when sent = 2 then 'ok' else 'FAIL' end || '] merge sends each draft to the checker: ' || sent;
  select count(*) into n from public.claim_view where project_id = p;
  r := r || E'\n[' || case when n = 3 then 'ok' else 'FAIL' end || '] merged claims are in main memory (rows: ' || n || ')';
  select count(*) into n from public.claim_view where project_id = p and branch_id = br;
  r := r || E'\n[' || case when n = 2 then 'ok' else 'FAIL' end || '] merged claims keep their branch of origin';
  begin perform public.merge_branch(p, 'payments-v2'); r := r || E'\n[FAIL] merged twice';
  exception when others then r := r || E'\n[ok] cannot merge twice: ' || sqlstate; end;
  begin
    perform public.ingest_claims(p, 'br-a@test.dev', 'm', 'c', null, '{}',
      '[{"text":"A late claim for a merged branch.","type":"fact"}]', 'payments-v2');
    r := r || E'\n[FAIL] saved into a merged branch';
  exception when others then r := r || E'\n[ok] merged branch is closed to new claims: ' || sqlstate; end;

  -- Abandon: drafts never reach main.
  perform public.ingest_claims(p, 'br-a@test.dev', 'm', 'c', null, '{}',
    '[{"text":"The shop might add crypto payments.","type":"assumption","rationale":"Asked by two customers."}]', 'crypto-idea');
  select count(*) into n from public.branch_claim_view where project_id = p and rationale = 'Asked by two customers.';
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] drafts carry their why';
  perform public.abandon_branch(p, 'crypto-idea');
  select count(*) into n from public.claim_view where project_id = p and text like '%crypto%';
  r := r || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] abandoned drafts never reach main';
  select count(*) into n from public.branch_claim_view where project_id = p and branch_status = 'abandoned';
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] abandoned drafts are kept, not deleted';

  -- A claim's branch cannot be rewritten.
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  reset role;
  begin update public.claims set branch_id = null where id = draft; r := r || E'\n[FAIL] branch rewritten';
  exception when others then r := r || E'\n[ok] a claim''s branch is immutable'; end;

  raise exception 'RESULTS (rolled back):%', r;
end $t$;
