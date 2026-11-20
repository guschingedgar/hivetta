-- Invariant 3: everything is project-scoped, enforced by row-level security.
-- Helpers are SECURITY DEFINER so policies on `members` do not recurse into
-- themselves (the classic Supabase infinite-recursion failure).

create function app.role_rank(p_role text) returns int
language sql immutable set search_path = '' as $$
  select case p_role when 'viewer' then 1 when 'contributor' then 2 when 'admin' then 3 else 0 end
$$;

create function app.has_workspace_role(p_workspace_id uuid, p_min_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and app.role_rank(m.role) >= app.role_rank(p_min_role)
  )
$$;

create function app.has_project_role(p_project_id uuid, p_min_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    join public.members m on m.workspace_id = p.workspace_id
    where p.id = p_project_id
      and m.user_id = (select auth.uid())
      and app.role_rank(m.role) >= app.role_rank(p_min_role)
  )
$$;

revoke all on function app.role_rank(text), app.has_workspace_role(uuid, text),
  app.has_project_role(uuid, text) from public;
grant execute on function app.role_rank(text), app.has_workspace_role(uuid, text),
  app.has_project_role(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, grant only what each table needs. Column
-- lists mean a client cannot set claims.status on insert, or rewrite text.
-- ---------------------------------------------------------------------------

revoke all on public.workspaces, public.members, public.invitations, public.projects,
  public.sources, public.claims, public.edges, public.conflicts, public.audit_log,
  public.claim_view
  from anon, authenticated;
revoke all on app.outbox from public, anon, authenticated;

grant select, update (name)            on public.workspaces  to authenticated;
grant select, update (role), delete    on public.members     to authenticated;
grant select                           on public.invitations to authenticated;
grant select, insert (workspace_id, name), update (name) on public.projects to authenticated;
grant select, insert (project_id, author_id, author_label, model, client, client_id, raw_payload)
                                       on public.sources     to authenticated;
grant select, insert (project_id, source_id, text, type, confidence, embedding, embedding_model),
      update (status)                  on public.claims      to authenticated;
grant select                           on public.edges       to authenticated;
grant select                           on public.conflicts   to authenticated;
grant select                           on public.audit_log   to authenticated;
grant select                           on public.claim_view  to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table public.workspaces  enable row level security;
alter table public.members     enable row level security;
alter table public.invitations enable row level security;
alter table public.projects    enable row level security;
alter table public.sources     enable row level security;
alter table public.claims      enable row level security;
alter table public.edges       enable row level security;
alter table public.conflicts   enable row level security;
alter table public.audit_log   enable row level security;
alter table app.outbox         enable row level security;  -- no policies: worker only

create policy workspaces_select on public.workspaces for select to authenticated
  using (app.has_workspace_role(id, 'viewer'));
create policy workspaces_update on public.workspaces for update to authenticated
  using (app.has_workspace_role(id, 'admin'));

create policy members_select on public.members for select to authenticated
  using (app.has_workspace_role(workspace_id, 'viewer'));
create policy members_update on public.members for update to authenticated
  using (app.has_workspace_role(workspace_id, 'admin'));
create policy members_delete on public.members for delete to authenticated
  using (app.has_workspace_role(workspace_id, 'admin') and user_id <> (select auth.uid()));

create policy invitations_select on public.invitations for select to authenticated
  using (app.has_workspace_role(workspace_id, 'admin'));

create policy projects_select on public.projects for select to authenticated
  using (app.has_workspace_role(workspace_id, 'viewer'));
create policy projects_insert on public.projects for insert to authenticated
  with check (app.has_workspace_role(workspace_id, 'admin'));
create policy projects_update on public.projects for update to authenticated
  using (app.has_workspace_role(workspace_id, 'admin'));

create policy sources_select on public.sources for select to authenticated
  using (app.has_project_role(project_id, 'viewer'));
-- Provenance cannot be forged: you can only record a source as yourself.
create policy sources_insert on public.sources for insert to authenticated
  with check (app.has_project_role(project_id, 'contributor')
              and author_id = (select auth.uid()));

create policy claims_select on public.claims for select to authenticated
  using (app.has_project_role(project_id, 'viewer'));
-- ...and you can only attach claims to a source you authored.
create policy claims_insert on public.claims for insert to authenticated
  with check (
    app.has_project_role(project_id, 'contributor')
    and status = 'proposed'
    and exists (
      select 1 from public.sources s
      where s.project_id = claims.project_id and s.id = claims.source_id
        and s.author_id = (select auth.uid())
    )
  );
-- Accept / reject is a human decision by a project admin.
create policy claims_update on public.claims for update to authenticated
  using (app.has_project_role(project_id, 'admin'))
  with check (app.has_project_role(project_id, 'admin'));

create policy edges_select on public.edges for select to authenticated
  using (app.has_project_role(project_id, 'viewer'));
create policy conflicts_select on public.conflicts for select to authenticated
  using (app.has_project_role(project_id, 'viewer'));
create policy audit_log_select on public.audit_log for select to authenticated
  using (app.has_workspace_role(workspace_id, 'admin'));

-- ---------------------------------------------------------------------------
-- RPCs for operations that span tables or need to bootstrap permissions
-- ---------------------------------------------------------------------------

-- Creating a workspace makes the caller its first admin. RLS alone cannot do
-- this: there is no membership yet to authorise the insert.
create function public.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.workspaces (name, created_by) values (p_name, auth.uid()) returning id into v_id;
  insert into public.members (workspace_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end $$;

-- Adds an existing user directly, or records an invitation that is accepted
-- when that email is confirmed. Returns 'added' or 'invited'.
create function public.invite_member(p_workspace_id uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_user  uuid;
begin
  if not app.has_workspace_role(p_workspace_id, 'admin') then
    raise exception 'only workspace admins can invite members' using errcode = '42501';
  end if;
  if p_role not in ('viewer', 'contributor', 'admin') then
    raise exception 'invalid role %', p_role using errcode = '22023';
  end if;

  select u.id into v_user from auth.users u
  where lower(u.email) = v_email and u.email_confirmed_at is not null;

  if v_user is not null then
    insert into public.members (workspace_id, user_id, role) values (p_workspace_id, v_user, p_role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
    return 'added';
  end if;

  insert into public.invitations (workspace_id, email, role, invited_by)
  values (p_workspace_id, v_email, p_role, auth.uid())
  on conflict (workspace_id, email) do update
    set role = excluded.role, invited_by = excluded.invited_by, accepted_at = null;
  return 'invited';
end $$;

-- Converts pending invitations once the address is proven to be theirs.
create function app.accept_invitations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.members (workspace_id, user_id, role)
  select i.workspace_id, new.id, i.role
  from public.invitations i
  where i.email = lower(new.email) and i.accepted_at is null
  on conflict (workspace_id, user_id) do nothing;

  update public.invitations set accepted_at = now()
  where email = lower(new.email) and accepted_at is null;
  return null;
end $$;

create trigger on_auth_user_email_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function app.accept_invitations();

-- Supersede = edge recording why and who + status change, atomically.
create function public.supersede_claim(p_old_claim uuid, p_new_claim uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  select c.project_id into v_project from public.claims c where c.id = p_old_claim;
  if v_project is null or not app.has_project_role(v_project, 'admin') then
    -- Same error whether the claim is missing or hidden: no existence oracle.
    raise exception 'claim % not found or not permitted', p_old_claim using errcode = '42501';
  end if;

  insert into public.edges (project_id, from_claim, to_claim, type, created_by, actor_id, reason)
  values (v_project, p_new_claim, p_old_claim, 'supersedes', 'human', auth.uid(), p_reason);

  update public.claims set status = 'superseded', superseded_by = p_new_claim
  where id = p_old_claim;
end $$;

revoke all on function public.create_workspace(text), public.invite_member(uuid, text, text),
  public.supersede_claim(uuid, uuid, text) from public, anon;
grant execute on function public.create_workspace(text), public.invite_member(uuid, text, text),
  public.supersede_claim(uuid, uuid, text) to authenticated;
