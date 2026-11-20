-- Inviting someone who is already a member no longer changes their role (it could demote the only admin,
-- yourself included), and the database refuses any change that leaves a workspace without an admin.

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
    if exists (select 1 from public.members m where m.workspace_id = p_workspace_id and m.user_id = v_user) then
      return 'member';
    end if;
    insert into public.members (workspace_id, user_id, role) values (p_workspace_id, v_user, p_role);
    return 'added';
  end if;

  insert into public.invitations (workspace_id, email, role, invited_by)
  values (p_workspace_id, v_email, p_role, auth.uid())
  on conflict (workspace_id, email) do update
    set role = excluded.role, invited_by = excluded.invited_by, accepted_at = null;
  return 'invited';
end $$;

create or replace function app.keep_an_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role <> 'admin' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.role = 'admin' then return new; end if;
  -- An account being deleted takes its memberships with it; that must not be blocked.
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then return old; end if;
  if not exists (
    select 1 from public.members m
    where m.workspace_id = old.workspace_id and m.role = 'admin' and m.user_id <> old.user_id
  ) then
    raise exception 'a workspace must keep at least one admin' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists keep_an_admin on public.members;
create trigger keep_an_admin before update of role or delete on public.members
  for each row execute function app.keep_an_admin();
