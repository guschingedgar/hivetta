-- Admins can cancel an invitation that hasn't been used yet (from the web app only).
-- Removing a member already works through members_delete (admin, first-party, never yourself)
-- and is recorded by the members_audit trigger.
grant delete on public.invitations to authenticated;
create policy invitations_delete on public.invitations for delete to authenticated
  using (app.is_first_party() and app.has_workspace_role(workspace_id, 'admin') and accepted_at is null);

create function app.invitations_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (workspace_id, actor, action, target_table, target_id, payload)
  values (old.workspace_id, auth.uid(), 'invitation.cancelled', 'invitations', old.id::text,
          jsonb_build_object('email', old.email, 'role', old.role));
  return null;
end $$;
create trigger invitations_audit after delete on public.invitations
  for each row execute function app.invitations_audit();
