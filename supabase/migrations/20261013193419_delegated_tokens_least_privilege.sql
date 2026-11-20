-- Least privilege for delegated (OAuth) tokens.
--
-- A token Supabase issues to an OAuth client (Claude, ChatGPT, any client
-- registered dynamically) is a full user token for the Supabase API, not just
-- for our MCP server. Such tokens carry a client_id claim; first-party web
-- sessions do not. Delegated tokens may read and propose. Every human-review
-- and administrative action requires a first-party session.

create function app.is_first_party() returns boolean
language sql stable set search_path = '' as $$
  select (auth.jwt() ->> 'client_id') is null
$$;
revoke all on function app.is_first_party() from public;
grant execute on function app.is_first_party() to authenticated, service_role;

alter policy claims_update on public.claims
  using (app.is_first_party() and app.has_project_role(project_id, 'admin'))
  with check (app.is_first_party() and app.has_project_role(project_id, 'admin'));

alter policy workspaces_update on public.workspaces
  using (app.is_first_party() and app.has_workspace_role(id, 'admin'));

alter policy members_update on public.members
  using (app.is_first_party() and app.has_workspace_role(workspace_id, 'admin'));
alter policy members_delete on public.members
  using (app.is_first_party() and app.has_workspace_role(workspace_id, 'admin') and user_id <> (select auth.uid()));

alter policy projects_insert on public.projects
  with check (app.is_first_party() and app.has_workspace_role(workspace_id, 'admin'));
alter policy projects_update on public.projects
  using (app.is_first_party() and app.has_workspace_role(workspace_id, 'admin'));

alter policy invitations_select on public.invitations
  using (app.is_first_party() and app.has_workspace_role(workspace_id, 'admin'));
alter policy audit_log_select on public.audit_log
  using (app.is_first_party() and app.has_workspace_role(workspace_id, 'admin'));

create or replace function public.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not app.is_first_party() then
    raise exception 'workspaces can only be created from the web app' using errcode = '42501';
  end if;
  insert into public.workspaces (name, created_by) values (p_name, auth.uid()) returning id into v_id;
  insert into public.members (workspace_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end $$;

create or replace function public.invite_member(p_workspace_id uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_user  uuid;
begin
  if not app.is_first_party() or not app.has_workspace_role(p_workspace_id, 'admin') then
    raise exception 'only workspace admins can invite members, from the web app' using errcode = '42501';
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

create or replace function public.supersede_claim(p_old_claim uuid, p_new_claim uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  select c.project_id into v_project from public.claims c where c.id = p_old_claim;
  if v_project is null or not app.is_first_party() or not app.has_project_role(v_project, 'admin') then
    raise exception 'claim % not found or not permitted', p_old_claim using errcode = '42501';
  end if;

  insert into public.edges (project_id, from_claim, to_claim, type, created_by, actor_id, reason)
  values (v_project, p_new_claim, p_old_claim, 'supersedes', 'human', auth.uid(), p_reason);

  update public.claims set status = 'superseded', superseded_by = p_new_claim
  where id = p_old_claim;
end $$;
