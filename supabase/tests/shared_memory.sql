-- Paste into the Supabase SQL editor or run with psql. The final exception
-- rolls back all fixtures. Every result line should read [ok].
do $test$
<<t>>
declare
  owner_id uuid := gen_random_uuid(); outsider_id uuid := gen_random_uuid();
  workspace_id uuid; project_id uuid; conversation_id uuid; claim_id uuid; source_id uuid;
  n int; results text := ''; first_party text; delegated text;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
  values (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shared-owner@test.dev', now()),
         (outsider_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shared-outsider@test.dev', now());
  first_party := json_build_object('sub', owner_id, 'role', 'authenticated')::text;
  delegated := json_build_object('sub', owner_id, 'role', 'authenticated', 'client_id', 'claude-test')::text;

  perform set_config('request.jwt.claims', first_party, true);
  set local role authenticated;
  workspace_id := public.create_workspace('Shared memory test');
  insert into public.projects (workspace_id, name) values (workspace_id, 'Project') returning id into project_id;
  insert into public.conversations (project_id, owner_id, title)
    values (project_id, owner_id, 'Plan') returning id into conversation_id;
  insert into public.messages (project_id, conversation_id, author_id, role, content)
    values (project_id, conversation_id, owner_id, 'user', 'We decided to use PostgreSQL.');
  select count(*) into n from public.messages m where m.conversation_id = t.conversation_id;
  results := results || E'\n[' || case when n >= 1 then 'ok' else 'FAIL' end || '] first-party conversation write';

  insert into public.sources (project_id, author_id, author_label, model, client, raw_payload)
    values (project_id, owner_id, 'shared-owner@test.dev', 'ollama-test', 'shared-web-chat', '{}') returning id into source_id;
  insert into public.claims (project_id, source_id, text, type)
    values (project_id, source_id, 'The project uses PostgreSQL for shared memory.', 'decision') returning id into claim_id;
  update public.claims set status = 'accepted' where id = claim_id;
  begin
    update public.claims set status = 'retired' where id = claim_id;
    results := results || E'\n[FAIL] direct retirement accepted';
  exception when others then results := results || E'\n[ok] direct retirement refused'; end;

  perform set_config('request.jwt.claims', delegated, true);
  begin
    perform public.retire_claim(claim_id, 'Outdated decision');
    results := results || E'\n[FAIL] delegated retirement accepted';
  exception when others then results := results || E'\n[ok] delegated retirement refused'; end;
  begin
    insert into public.messages (project_id, conversation_id, author_id, role, content)
      values (project_id, conversation_id, owner_id, 'user', 'Forged web message');
    results := results || E'\n[FAIL] delegated message accepted';
  exception when others then results := results || E'\n[ok] delegated message refused'; end;

  perform set_config('request.jwt.claims', first_party, true);
  perform public.retire_claim(claim_id, 'The team changed its decision');
  select count(*) into n from public.claims where id = claim_id and status = 'retired';
  results := results || E'\n[' || case when n = 1 then 'ok' else 'FAIL' end || '] admin retirement';
  select count(*) into n from public.search_claims(p_project_id => project_id, p_query => 'PostgreSQL');
  results := results || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] retired claim excluded from default search';

  perform set_config('request.jwt.claims', json_build_object('sub', outsider_id, 'role', 'authenticated')::text, true);
  select count(*) into n from public.conversations c where c.id = t.conversation_id;
  results := results || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] outsider cannot read conversation';
  select count(*) into n from public.messages m where m.project_id = t.project_id;
  results := results || E'\n[' || case when n = 0 then 'ok' else 'FAIL' end || '] outsider cannot read messages';

  raise exception 'RESULTS (rolled back):%', results;
end $test$;
