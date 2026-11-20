-- Core schema. Every allowed value in a CHECK below mirrors a Zod enum in
-- packages/schema/src/enums.ts; packages/schema/src/drift.test.ts fails if they diverge.

create extension if not exists vector with schema extensions;

-- Private schema: helpers, triggers and the outbox. Not exposed through PostgREST.
create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 100),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.members (
  workspace_id uuid not null references public.workspaces(id),
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('viewer', 'contributor', 'admin')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index members_user_idx on public.members (user_id);

-- Invitations for people who have not signed up yet; converted to members
-- when their email is confirmed (see the rls migration).
create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  email        text not null check (email = lower(email) and position('@' in email) > 1),
  role         text not null check (role in ('viewer', 'contributor', 'admin')),
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (workspace_id, email)
);

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  name         text not null check (length(trim(name)) between 1 and 100),
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);
create index projects_workspace_idx on public.projects (workspace_id);

-- ---------------------------------------------------------------------------
-- Knowledge
-- ---------------------------------------------------------------------------

-- One row per write event (e.g. one propose_claims call). Provenance lives here.
create table public.sources (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id),
  -- Nullable so deleting a user does not destroy provenance; author_label is the
  -- immutable snapshot of who wrote it.
  author_id    uuid references auth.users(id) on delete set null,
  author_label text not null check (length(trim(author_label)) > 0),
  model        text not null check (length(trim(model)) between 1 and 100),
  client       text not null check (length(trim(client)) between 1 and 100),
  client_id    text,                        -- OAuth client that presented the token
  raw_payload  jsonb not null,
  created_at   timestamptz not null default now(),
  unique (project_id, id)                   -- target of the composite FKs below
);

create table public.claims (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id),
  source_id       uuid not null,
  text            text not null check (length(trim(text)) between 8 and 2000),
  type            text not null check (type in ('decision', 'fact', 'assumption', 'open_question')),
  status          text not null default 'proposed'
                  check (status in ('proposed', 'accepted', 'rejected', 'superseded')),
  -- The proposing model's self-report. Uncalibrated: never rank or filter on it.
  confidence      real check (confidence between 0 and 1),
  embedding       extensions.vector(1536),
  embedding_model text,
  fts             tsvector generated always as (to_tsvector('english', text)) stored,
  created_at      timestamptz not null default now(),
  superseded_by   uuid,
  unique (project_id, id),
  -- Invariant 3: a claim's source must be in the same project.
  constraint claims_source_fk foreign key (project_id, source_id)
    references public.sources (project_id, id),
  constraint claims_superseded_by_fk foreign key (project_id, superseded_by)
    references public.claims (project_id, id),
  check ((embedding is null) = (embedding_model is null)),
  check ((status = 'superseded') = (superseded_by is not null)),
  check (superseded_by is null or superseded_by <> id)
);
create index claims_project_status_type_idx on public.claims (project_id, status, type);
create index claims_project_created_idx on public.claims (project_id, created_at desc);
create index claims_source_idx on public.claims (project_id, source_id);
create index claims_fts_idx on public.claims using gin (fts);
create index claims_embedding_idx on public.claims
  using hnsw (embedding extensions.vector_cosine_ops);

-- Directed: from_claim <type> to_claim. For 'supersedes', from = the new claim.
create table public.edges (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id),
  from_claim  uuid not null,
  to_claim    uuid not null,
  type        text not null
              check (type in ('supersedes', 'duplicates', 'contradicts', 'supports', 'refines')),
  created_by  text not null check (created_by in ('human', 'reasoner')),
  actor_id    uuid references auth.users(id) on delete set null,
  reason      text not null check (length(trim(reason)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  foreign key (project_id, from_claim) references public.claims (project_id, id),
  foreign key (project_id, to_claim)   references public.claims (project_id, id),
  check (from_claim <> to_claim)
);
create index edges_to_idx on public.edges (to_claim, type);
create index edges_from_idx on public.edges (from_claim, type);

-- Phase 2 writes these; phase 1 only defines them. claim_a < claim_b keeps
-- each pair canonical so the same conflict is never recorded twice.
create table public.conflicts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id),
  claim_a     uuid not null,
  claim_b     uuid not null,
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution  text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  foreign key (project_id, claim_a) references public.claims (project_id, id),
  foreign key (project_id, claim_b) references public.claims (project_id, id),
  check (claim_a < claim_b),
  check ((status = 'open') = (resolution is null)),
  unique (claim_a, claim_b)
);
create index conflicts_project_status_idx on public.conflicts (project_id, status);

create table public.audit_log (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id),
  project_id   uuid references public.projects(id),
  actor        uuid references auth.users(id) on delete set null,
  action       text not null,
  target_table text not null,
  target_id    text not null,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_workspace_idx on public.audit_log (workspace_id, created_at desc);

-- Transactional outbox: written by triggers in the same transaction as the
-- change, relayed to pg-boss by apps/worker. Avoids a dual write from the API.
create table app.outbox (
  id            bigint generated always as identity primary key,
  topic         text not null,
  payload       jsonb not null,
  created_at    timestamptz not null default now(),
  dispatched_at timestamptz
);
create index outbox_pending_idx on app.outbox (id) where dispatched_at is null;

-- Read model: claims joined to their provenance. Never exposes the embedding.
create view public.claim_view with (security_invoker = true) as
select
  c.id, c.project_id, c.text, c.type, c.status, c.confidence, c.created_at, c.superseded_by,
  c.source_id, s.author_id, s.author_label, s.model, s.client, s.created_at as recorded_at
from public.claims c
join public.sources s on s.project_id = c.project_id and s.id = c.source_id;
