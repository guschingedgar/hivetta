-- Invariant 2 (nothing is hard-deleted) and the claim lifecycle, enforced by
-- triggers so they hold even for the service role, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- No deletes, ever, on knowledge and tenancy tables
-- ---------------------------------------------------------------------------

create function app.forbid_delete() returns trigger
language plpgsql as $$
begin
  raise exception '% rows are never deleted (invariant 2: supersede instead)', tg_table_name
    using errcode = '42501';
end $$;

do $$
declare t text;
begin
  foreach t in array array['workspaces', 'projects', 'sources', 'claims', 'edges', 'conflicts', 'audit_log']
  loop
    execute format(
      'create trigger %1$s_no_delete before delete on public.%1$s
         for each row execute function app.forbid_delete()', t);
    execute format(
      'create trigger %1$s_no_truncate before truncate on public.%1$s
         for each statement execute function app.forbid_delete()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Append-only rows. The one permitted update is the user-FK column going to
-- NULL, which is what ON DELETE SET NULL does when a user account is removed.
-- ---------------------------------------------------------------------------

create function app.immutable_except_nulling() returns trigger
language plpgsql as $$
declare col text := tg_argv[0];
begin
  if (to_jsonb(new) - col) is distinct from (to_jsonb(old) - col)
     or ((to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col)
         and (to_jsonb(new) ->> col) is not null) then
    raise exception '% rows are immutable', tg_table_name using errcode = '42501';
  end if;
  return new;
end $$;

create trigger sources_immutable before update on public.sources
  for each row execute function app.immutable_except_nulling('author_id');
create trigger edges_immutable before update on public.edges
  for each row execute function app.immutable_except_nulling('actor_id');
create trigger audit_log_immutable before update on public.audit_log
  for each row execute function app.immutable_except_nulling('actor');

-- ---------------------------------------------------------------------------
-- Claim lifecycle
--   proposed -> accepted | rejected | superseded
--   accepted -> superseded
-- Content and provenance never change. An embedding may be (re)computed.
-- ---------------------------------------------------------------------------

create function app.claims_guard_update() returns trigger
language plpgsql as $$
begin
  if new.project_id <> old.project_id or new.source_id <> old.source_id
     or new.text <> old.text or new.type <> old.type
     or new.confidence is distinct from old.confidence
     or new.created_at <> old.created_at then
    raise exception 'claim % is immutable: only status, superseded_by and embedding may change', old.id
      using errcode = '42501';
  end if;

  if new.status <> old.status and not (
       (old.status = 'proposed' and new.status in ('accepted', 'rejected', 'superseded'))
    or (old.status = 'accepted' and new.status = 'superseded')
  ) then
    raise exception 'illegal status transition % -> % for claim %', old.status, new.status, old.id
      using errcode = '23514';
  end if;

  if old.superseded_by is not null and new.superseded_by is distinct from old.superseded_by then
    raise exception 'claim % is already superseded', old.id using errcode = '23514';
  end if;

  return new;
end $$;

create trigger claims_guard_update before update on public.claims
  for each row execute function app.claims_guard_update();

-- The supersedes edge is the source of truth; claims.superseded_by is a
-- denormalised pointer. Checked at commit, so both can be written in one
-- transaction in either order.
create function app.claims_require_supersede_edge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.superseded_by is not null and not exists (
    select 1 from public.edges e
    where e.type = 'supersedes' and e.from_claim = new.superseded_by and e.to_claim = new.id
  ) then
    raise exception 'claim % marked superseded without a supersedes edge recording why', new.id
      using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger claims_require_supersede_edge
  after insert or update of superseded_by on public.claims
  deferrable initially deferred
  for each row execute function app.claims_require_supersede_edge();

-- ---------------------------------------------------------------------------
-- Audit log and outbox, written by the database so no code path can skip them
-- ---------------------------------------------------------------------------

create function app.claims_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (workspace_id, project_id, actor, action, target_table, target_id, payload)
  select p.workspace_id, i.project_id, auth.uid(), 'claim.proposed', 'claims', i.id::text,
         jsonb_build_object('type', i.type, 'source_id', i.source_id)
  from inserted i join public.projects p on p.id = i.project_id;

  insert into app.outbox (topic, payload)
  select 'claim.analyse', jsonb_build_object('claim_id', i.id, 'project_id', i.project_id)
  from inserted i;

  return null;
end $$;

create trigger claims_after_insert after insert on public.claims
  referencing new table as inserted
  for each statement execute function app.claims_after_insert();

create function app.claims_after_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (workspace_id, project_id, actor, action, target_table, target_id, payload)
  select p.workspace_id, new.project_id, auth.uid(), 'claim.' || new.status, 'claims', new.id::text,
         jsonb_build_object('from', old.status, 'to', new.status, 'superseded_by', new.superseded_by)
  from public.projects p where p.id = new.project_id;
  return null;
end $$;

create trigger claims_after_status_change after update of status on public.claims
  for each row when (old.status is distinct from new.status)
  execute function app.claims_after_status_change();

create function app.edges_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (workspace_id, project_id, actor, action, target_table, target_id, payload)
  select p.workspace_id, new.project_id, coalesce(new.actor_id, auth.uid()), 'edge.created', 'edges', new.id::text,
         jsonb_build_object('type', new.type, 'from', new.from_claim, 'to', new.to_claim,
                            'created_by', new.created_by, 'reason', new.reason)
  from public.projects p where p.id = new.project_id;
  return null;
end $$;

create trigger edges_after_insert after insert on public.edges
  for each row execute function app.edges_after_insert();

create function app.projects_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (workspace_id, project_id, actor, action, target_table, target_id, payload)
  values (new.workspace_id, new.id, auth.uid(), 'project.created', 'projects', new.id::text,
          jsonb_build_object('name', new.name));
  return null;
end $$;

create trigger projects_after_insert after insert on public.projects
  for each row execute function app.projects_after_insert();

create function app.members_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.members := coalesce(new, old);
begin
  insert into public.audit_log (workspace_id, actor, action, target_table, target_id, payload)
  values (r.workspace_id, auth.uid(),
          case tg_op when 'INSERT' then 'member.added'
                     when 'UPDATE' then 'member.role_changed'
                     else 'member.removed' end,
          'members', r.user_id::text,
          jsonb_build_object('role', r.role, 'previous_role', case when tg_op = 'UPDATE' then old.role end));
  return null;
end $$;

create trigger members_audit after insert or update or delete on public.members
  for each row execute function app.members_audit();
