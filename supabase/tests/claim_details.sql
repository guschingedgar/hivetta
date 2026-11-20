-- claim details: rationale / details / links are optional, validated, readable
-- through claim_view, and immutable once saved. Rolled back.
do $t$
declare
  ua uuid := gen_random_uuid();
  w uuid; p uuid; a uuid; b uuid; n int; r text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cd-a@test.dev', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  w := public.create_workspace('Details test');
  insert into public.projects (workspace_id, name) values (w, 'P') returning id into p;

  select x.id into a from public.ingest_claims(p, 'cd-a@test.dev', 'm', 'c', 'claude', '{}',
    '[{"text":"Payments use Stripe Checkout.","type":"decision","rationale":"Keeps PCI scope small; PayPal was considered but fees are higher.","details":"Hosted page, EUR and USD.","links":["https://stripe.com/docs/checkout"]}]') x;
  select count(*) into n from public.claim_view
    where id = a and rationale like 'Keeps PCI%' and details like 'Hosted%' and links = array['https://stripe.com/docs/checkout'];
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] details saved and visible in claim_view';

  select x.id into b from public.ingest_claims(p, 'cd-a@test.dev', 'm', 'c', 'claude', '{}',
    '[{"text":"Launch is in March.","type":"fact","rationale":"  ","links":[]}]') x;
  select count(*) into n from public.claims where id = b and rationale is null and details is null and links is null;
  r := r || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] blank fields stored as nothing';

  begin
    perform public.ingest_claims(p, 'cd-a@test.dev', 'm', 'c', 'claude', '{}', '[{"text":"Bad link here.","type":"fact","links":["javascript:alert(1)"]}]');
    r := r || E'\n[FAIL] accepted a non-http link';
  exception when others then r := r || E'\n[ok] non-http link rejected: ' || sqlstate; end;

  reset role;
  begin
    update public.claims set rationale = 'rewritten' where id = a;
    r := r || E'\n[FAIL] rationale was edited';
  exception when others then r := r || E'\n[ok] rationale is immutable: ' || sqlstate; end;
  raise exception 'RESULTS (rolled back):%', r;
end $t$;
