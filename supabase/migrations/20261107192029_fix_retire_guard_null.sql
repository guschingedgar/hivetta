-- Fix: when app.memory_manager is unset, current_setting(..., true) returns
-- NULL, so the retire branch evaluated to NULL instead of false and the whole
-- `if ... not (...)` test became NULL, letting any project member set
-- status = 'retired' directly (no admin check, no reason, no audit row).
-- coalesce makes an unset flag mean "off".
create or replace function app.claims_guard_update() returns trigger
language plpgsql set search_path = '' as $$
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
    or (old.status in ('proposed', 'accepted') and new.status = 'retired'
        and coalesce(current_setting('app.memory_manager', true), '') = 'on')
  ) then
    raise exception 'illegal status transition % -> % for claim %', old.status, new.status, old.id
      using errcode = '23514';
  end if;
  if old.superseded_by is not null and new.superseded_by is distinct from old.superseded_by then
    raise exception 'claim % is already superseded', old.id using errcode = '23514';
  end if;
  return new;
end $$;
