-- Members with their emails, for the web UI. auth.users is not readable by
-- clients, so this SECURITY DEFINER function exposes exactly one field (email)
-- and only to people who are themselves members of that workspace.
create function public.workspace_members(p_workspace_id uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.members m
  join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace_id
    and app.has_workspace_role(p_workspace_id, 'viewer')
  order by m.created_at
$$;

revoke all on function public.workspace_members(uuid) from public, anon;
grant execute on function public.workspace_members(uuid) to authenticated;
