# Team Memory (product name: Hivetta) — guide for agents working in this repo

A shared memory layer for teams whose members use different LLMs. Each person connects our hosted MCP
server to their own assistant (Claude, ChatGPT, ...). Assistants save structured **claims** with full
provenance; any teammate, in any assistant, retrieves them. The hard problem is not storage but keeping a
shared knowledge base **trustworthy** while several people and models write to it: duplicates are merged,
contradictions are surfaced to a human, never auto-resolved.

Phase 1 goal (met in `apps/mcp-server/scripts/smoke.ts`): a claim written from one client is retrievable
from another with provenance intact.

## The three invariants

Enforced by the **database**, so they hold no matter which code path, surface, or role writes. Never move
one of them into application code only.

1. **Every claim has provenance.** `claims (project_id, source_id)` is a composite FK to `sources`, whose
   `author_label`, `model`, `client` are NOT NULL. `ingest_claims()` sets `author_id = auth.uid()` inside
   Postgres, and RLS only lets you insert a source as yourself, so provenance cannot be forged.
2. **Nothing is hard-deleted.** Before-delete/truncate triggers on workspaces, projects, sources, claims,
   edges, conflicts, audit_log. These fire even for the service role. Sources, edges and audit_log are
   append-only (the one allowed update: a user FK going NULL when the account is deleted). To retire a
   claim, supersede it: `supersede_claim()` writes a `supersedes` edge (who, why) and the status in one
   transaction; a deferred constraint trigger rejects any `superseded_by` without that edge.
3. **Everything is project-scoped.** RLS on every table via `app.has_project_role()` /
   `app.has_workspace_role()` (SECURITY DEFINER, which avoids recursive policies on `members`). Composite
   `(project_id, id)` FKs make cross-project references impossible, not just disallowed.

Also enforced in the database, not by convention:
- **Claim lifecycle**: `proposed -> accepted | rejected | superseded`, `accepted -> superseded`. Text,
  type, confidence and provenance are immutable. Column grants mean clients can only set `status`.
- **AI claim checker** (`supabase/functions/check-claim`): a trigger on `claims` calls the Edge Function
  through pg_net for every new claim (doorbell secret in Vault, checked by `verify_checker_secret`). Haiku
  compares the claim with `claim_neighbours()` and the verdict is applied by `apply_claim_verdict()`,
  which only the service role can call: `new` -> accepted, `duplicate` -> `duplicates` edge + rejected,
  `conflict` -> `contradicts` edge + open `conflicts` row, claim stays proposed for a human. Each claim
  is judged once; `claim_checks` keeps every verdict and its reason, immutably. Any checker failure
  leaves the claim proposed. Model: `CHECKER_MODEL` (default claude-haiku-5-5); key: Supabase secret
  `ANTHROPIC_API_KEY`. Users' assistants still cannot accept anything themselves.
- **Handoffs** (`handoffs`, `handoff_claims`): a state-of-play note (summary, next steps, links) plus the
  claims recorded with it, written in one transaction by `create_handoff()` (SECURITY INVOKER, so RLS
  decides). Provenance via `sources` like claims; append-only; project-scoped. Delegated tokens may create
  them (a handoff is a proposal, not a review). Its claims are ordinary claims and go through the checker.
- **Branches** (`branches`, `claims.branch_id`): draft spaces. `ingest_claims(..., p_branch)` saves claims to
  an open branch (created on first use). `claim_view` is main memory only (no branch, or a merged one), so
  every read path hides drafts; `branch_claim_view` shows them on purpose. Drafts are not checked at insert.
  `merge_branch()` closes the branch and sends each draft to the checker (`app.request_claim_check`);
  `claim_neighbours` never compares with open drafts or same-branch siblings. `abandon_branch()` closes
  without merging; drafts are kept. Closed branches are final. Any contributor may merge, assistants
  included: the checker is the reviewer, conflicts still go to a human.
- **Display names** (`profiles`): each person picks a name once (`/hello`, or at sign-up via user metadata).
  Set only by the person from a first-party session; visible to people sharing a workspace. `claim_view` and
  `branch_claim_view` show `coalesce(display_name, sources.author_label)` as `author_label`; the raw label in
  `sources` never changes.
- **Auto-save** (`profiles.auto_save`: off | drafts | memory): a per-person setting (Connect page). The MCP server reads it per
  request and adds save-on-your-own rules to the server instructions and the `propose_claims` description. The AI sets
  `auto: true` on such saves (kept in `sources.raw_payload`, shown as `auto_saved` in the views). In `drafts` mode, auto saves
  without a branch go to the person's open `auto/<name>-<date>` branch. Takes effect in new conversations.
- **Private beta lock** (app layer, not a security boundary for data): with `HIVETTA_ACCESS_CODE` set on Vercel, `proxy.ts`
  sends every app page to `/locked` until the browser has the `hv_access` cookie (`lib/access.ts`). The landing page `/`, the example tour `/welcome` and `/data` are public; `/api/*`, `/.well-known`,
  icons and `robots.txt` stay open so AI connectors keep working; robots.txt disallows all while it is on. Delete the
  variable and redeploy to open the site.
- **Removing people**: `members_delete` (first-party admin, never yourself) and `invitations_delete` (first-party
  admin, unused invitations only). Both audited. A removed member's memories stay, with their name.
  Trigger `keep_an_admin` refuses any role change or removal that would leave a workspace without an admin;
  `invite_member` on someone already a member returns `member` and changes nothing.
- **Conflict resolution** (`resolve_conflict()`): first-party project admins only. Keep one claim (accepted
  loser -> `supersedes` edge + superseded; proposed loser -> rejected) or keep both (conflict dismissed).
  One transaction with an audit row.
- **Delegated tokens are read + propose only.** Tokens Supabase issues to OAuth clients carry `client_id`
  and are full user tokens for Supabase's REST API. `app.is_first_party()` gates every review and admin
  action (accept/reject, supersede, invite, create project/workspace) to first-party web sessions.
- **Audit log and job queueing** are written by triggers, so no code path can skip them.

## Architecture

```
supabase/migrations/   SQL: the schema's source of truth. Tests in supabase/tests/*.sql
packages/schema        Zod. The ONE definition of claims, enums, filters, tool inputs
packages/store         The ONLY module that touches Postgres
  .                      createUserStore: supabase-js with the caller's JWT, so RLS decides
  ./service              createServiceStore + createQueue: owner access (bypasses RLS!), worker only
packages/embeddings    Embedder interface; OpenAI 1536 optional, keyword-only without API cost, fake for tests
packages/ingest        any payload -> IngestRequest -> validate -> provenance -> embed -> store
  adapters/mcp.ts        the only MCP-aware file in ingest; a new source = a new adapter file
packages/reasoner      Verdict + Reasoner interface + no-op; analyseClaim pipeline (phase 2 seam)
packages/retrieval     searchMemory (hybrid), getProjectBrief, listOpenQuestions, listProjects
apps/mcp-server        MCP surface: token verifier, 9 tools, tool descriptions. Web-standard handlers
apps/web               Next.js 16: landing (/, app/landing: own light stylesheet + Motion scenes), login, consent, /welcome (client-only
                       tour with example data, shown after sign-up; never writes to the DB), app under app/(app): sidebar (workspace
                       switcher, projects as folders), /projects (home feed), /inbox (all conflicts), /setup (4 steps, live check via
                       /api/setup/status), /projects/[id] (overview, memory, conflicts, handoffs, branches, team); mounts /api/mcp
apps/worker            relays app.outbox -> pg-boss; runs claim.analyse through the reasoner (not deployed)
supabase/functions     check-claim: the deployed AI claim checker (Deno, service role)
```

Dependency rule: `apps/* -> {ingest, retrieval, store} -> {schema, embeddings, reasoner}`. Surfaces contain
no business logic. Only `store` imports `@supabase/supabase-js` for data; `apps/web` uses `@supabase/ssr`
for sessions only. Never import `@memory/store/service` from a request-serving surface.

Async work: a trigger on `claims` writes `app.outbox` in the same transaction as the insert (no dual write,
no lost jobs, and request paths never hold DB credentials). The worker relays rows to pg-boss using a
pre-minted `job_id`, so re-sends are no-ops. Conflict detection now runs in the check-claim Edge Function
(see above) rather than the worker, because nothing long-running is deployed.

## Stack decisions (verified October 2026; check docs again before relying on recalled APIs)

- **pnpm workspaces**, TypeScript everywhere; packages export `.ts` source (Next transpiles; tsx runs scripts).
- **Supabase** project (dedicated dev project, eu-west-3). Postgres 17, pgvector in the
  `extensions` schema (reference `extensions.vector`, `operator(extensions.<=>)`). Signing keys are ES256.
- **Supabase Auth is the OAuth 2.1 authorization server** (PKCE, dynamic client registration). We are only a
  resource server: `apps/mcp-server/src/auth.ts` verifies JWTs against the project JWKS.
- **MCP SDK v2** (`@modelcontextprotocol/server` 2.3): `createMcpHandler(factory)` builds a fresh McpServer
  per request from the verified `authInfo`; it serves 2026-07-28 traffic plus 2025-era clients statelessly.
  The v1 package `@modelcontextprotocol/sdk` is the legacy line: do not use it.
- **Zod 4** (shared with the SDK). The MCP tool advertises `ProposedClaimDraft` (loose types, same guidance)
  so the SDK cannot reject a whole batch; ingest applies strict `ProposedClaim` per item.
- **Next.js 16**: `proxy.ts` (not middleware.ts), async `params`/`searchParams`/`cookies()`.
- **pg-boss 12** (`import { PgBoss }`): `createQueue` before `send`; batch work handlers. Needs the session
  pooler or a direct connection, never the transaction pooler.
- Enumerated values are `text` + CHECK, not Postgres enums. `packages/schema/src/drift.test.ts` fails if a
  CHECK list and its Zod enum diverge: change both together.

## Working rules

- **Schema changes**: add a new migration file; never edit an applied one. Migrations applied through the
  Supabase MCP get a server-assigned version: rename the local file to match `list_migrations`. After a
  change, regenerate `packages/store/src/database.types.ts` and re-run `supabase/tests/*.sql` (each runs
  in one transaction and rolls back; every line must read `[ok]`). Then run the security advisor.
- **Never select `embedding` through PostgREST**: read from `claim_view` with `CLAIM_VIEW_COLUMNS`.
- **Search compares vectors only within one embedding model** (`p_embedding_model`). Changing the model
  means re-embedding, not mixing.
- **`confidence` is the proposing model's self-report.** Display it; never rank or filter on it.
- **Tool descriptions are prompts.** They live in `apps/mcp-server/src/tools.ts`; edit them as carefully as
  code, and keep them consistent with ingest's validation rules.
- Tests exist for ingest validation, retrieval filters and schema drift (`pnpm test`), plus the SQL suites
  and the live smoke test. Don't add tests for everything.
- Dev data is permanent (invariant 2). Smoke tests write to the "Smoke tests" workspace only.

## Known gaps

- No RFC 8707 audience binding: Supabase tokens carry `aud: authenticated`, so any token from this project is
  accepted by the MCP server. Keep the Supabase project dedicated to this app. Fix later with a Custom Access
  Token Hook setting `aud` to the MCP URL, then set `expectedResource` in `requireBearerAuth`.
- Supabase has no custom OAuth scopes (OIDC scopes only), so least privilege is enforced via `client_id` in RLS.
- Supabase does not yet support Client ID Metadata Documents; clients that require them must be pre-registered.
- The site lives at https://hivetta.com (APP_URL). `lib/mcp.ts` also serves the MCP endpoint and its OAuth metadata on
  each origin in `MCP_EXTRA_ORIGINS` (hivetta.vercel.app, team-memory-henna.vercel.app), so connectors added with an
  old address keep working.
- Provenance `client` is best-effort for 2025-era stateless clients (User-Agent, then OAuth client id).
- Vector search filters before ranking, so HNSW is unused (exact scan per project); fine until ~50k claims/project.
