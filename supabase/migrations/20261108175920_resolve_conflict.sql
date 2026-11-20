-- Resolve a conflict the AI checker opened. A human decision: first-party web
-- session of a project admin only (assistants never resolve conflicts).
--   p_keep = one of the two claims: it wins. If it was proposed it is accepted.
--            The other loses: an accepted loser is superseded by the winner
--            (supersedes edge, who and why); a proposed loser is rejected.
--   p_keep = null: both stand (not a real conflict). Proposed ones are accepted
--            and the conflict is dismissed.
-- Everything in one transaction, with an audit row. Nothing is deleted.
create function public.resolve_conflict(p_conflict uuid, p_keep uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  f public.conflicts%rowtype;
  v_loser uuid;
  v_loser_status text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_workspace uuid;
begin
  select * into f from public.conflicts where id = p_conflict for update;
  if f.id is null or not app.is_first_party() or not app.has_project_role(f.project_id, 'admin') then
    raise exception 'conflict not found or not permitted' using errcode = '42501';
  end if;
  if f.status <> 'open' then
    raise exception 'this conflict is already %', f.status using errcode = '23514';
  end if;
  if p_keep is not null and p_keep not in (f.claim_a, f.claim_b) then
    raise exception 'the kept claim must be one of the two in conflict' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'note must be at most 500 characters' using errcode = '22023';
  end if;

  if p_keep is null then
    update public.claims set status = 'accepted' where id in (f.claim_a, f.claim_b) and status = 'proposed';
    update public.conflicts
       set status = 'dismissed', resolved_by = auth.uid(), resolved_at = now(),
           resolution = coalesce(v_note, 'Both claims stand: not a real conflict.')
     where id = f.id;
  else
    v_loser := case when p_keep = f.claim_a then f.claim_b else f.claim_a end;
    update public.claims set status = 'accepted' where id = p_keep and status = 'proposed';
    select status into v_loser_status from public.claims where id = v_loser;
    if v_loser_status = 'accepted' then
      insert into public.edges (project_id, from_claim, to_claim, type, created_by, actor_id, reason)
        values (f.project_id, p_keep, v_loser, 'supersedes', 'human', auth.uid(),
                coalesce(v_note, 'Chosen over this claim when resolving a conflict.'));
      update public.claims set status = 'superseded', superseded_by = p_keep where id = v_loser;
    elsif v_loser_status = 'proposed' then
      update public.claims set status = 'rejected' where id = v_loser;
    end if;
    update public.conflicts
       set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
           resolution = coalesce(v_note, 'Kept one claim; the other was set aside.')
     where id = f.id;
  end if;

  select workspace_id into v_workspace from public.projects where id = f.project_id;
  insert into public.audit_log (workspace_id, project_id, actor, action, target_table, target_id, payload)
    values (v_workspace, f.project_id, auth.uid(), 'conflict.resolved', 'conflicts', f.id::text,
            jsonb_build_object('kept', p_keep, 'note', v_note));
end $$;
revoke all on function public.resolve_conflict(uuid, uuid, text) from public, anon;
grant execute on function public.resolve_conflict(uuid, uuid, text) to authenticated;
