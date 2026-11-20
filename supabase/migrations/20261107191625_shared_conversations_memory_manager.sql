-- Shared conversations are project scoped and readable by every project member.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  owner_id uuid references auth.users(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (project_id, id)
);
create index conversations_project_idx on public.conversations (project_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  conversation_id uuid not null,
  author_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  model text,
  content text not null check (length(trim(content)) between 1 and 12000),
  created_at timestamptz not null default now(),
  foreign key (project_id, conversation_id)
    references public.conversations (project_id, id),
  check ((role = 'assistant') = (model is not null))
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
revoke all on public.conversations, public.messages from public, anon, authenticated;
grant select, insert (project_id, owner_id, title), update (title)
  on public.conversations to authenticated;
grant select, insert (project_id, conversation_id, author_id, role, model, content)
  on public.messages to authenticated;

create policy conversations_select on public.conversations for select to authenticated
  using (app.has_project_role(project_id, 'viewer'));
create policy conversations_insert on public.conversations for insert to authenticated
  with check (app.is_first_party() and app.has_project_role(project_id, 'contributor')
              and owner_id = (select auth.uid()));
create policy conversations_update on public.conversations for update to authenticated
  using (app.is_first_party() and app.has_project_role(project_id, 'contributor')
         and (owner_id = (select auth.uid()) or app.has_project_role(project_id, 'admin')))
  with check (app.is_first_party() and app.has_project_role(project_id, 'contributor')
              and (owner_id = (select auth.uid()) or app.has_project_role(project_id, 'admin')));
create policy messages_select on public.messages for select to authenticated
  using (app.has_project_role(project_id, 'viewer'));
create policy messages_insert on public.messages for insert to authenticated
  with check (app.is_first_party() and app.has_project_role(project_id, 'contributor')
              and author_id = (select auth.uid()));

create trigger conversations_no_delete before delete on public.conversations
  for each row execute function app.forbid_delete();
create trigger messages_no_delete before delete on public.messages
  for each row execute function app.forbid_delete();
create trigger messages_immutable before update on public.messages
  for each row execute function app.immutable_except_nulling('author_id');

-- A retired claim is no longer returned by default retrieval. Its source and
-- audit trail remain so a team can explain why a model once used it.
alter table public.claims drop constraint claims_status_check;
alter table public.claims add constraint claims_status_check
  check (status in ('proposed', 'accepted', 'rejected', 'superseded', 'retired'));

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
        and current_setting('app.memory_manager', true) = 'on')
  ) then
    raise exception 'illegal status transition % -> % for claim %', old.status, new.status, old.id
      using errcode = '23514';
  end if;
  if old.superseded_by is not null and new.superseded_by is distinct from old.superseded_by then
    raise exception 'claim % is already superseded', old.id using errcode = '23514';
  end if;
  return new;
end $$;

create function public.retire_claim(p_claim uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  select project_id into v_project from public.claims
    where id = p_claim and status in ('proposed', 'accepted') for update;
  if v_project is null or not app.is_first_party()
     or not app.has_project_role(v_project, 'admin') then
    raise exception 'claim not found or not permitted' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then
    raise exception 'reason must contain 3 to 500 characters' using errcode = '22023';
  end if;
  perform set_config('app.memory_manager', 'on', true);
  update public.claims set status = 'retired' where id = p_claim;
  insert into public.audit_log (workspace_id, project_id, actor, action, target_table, target_id, payload)
    select p.workspace_id, v_project, auth.uid(), 'memory.retired', 'claims', p_claim::text,
           jsonb_build_object('reason', trim(p_reason))
    from public.projects p where p.id = v_project;
end $$;
revoke all on function public.retire_claim(uuid, text) from public, anon;
grant execute on function public.retire_claim(uuid, text) to authenticated;
