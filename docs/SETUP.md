# Setup

## Run locally

The frontend at `/` starts with an empty browser-local prototype. The authenticated
studio at `/shared` uses Supabase accounts, shared conversations, automatic Ollama
memory proposals, review, and an admin memory manager.

From the repository root, run:

    corepack pnpm install --filter @memory/web...
    corepack pnpm --filter @memory/web dev --hostname 127.0.0.1

Then open http://127.0.0.1:3000. Use `/login` and `/console` to create accounts,
teams and projects; use `/shared` for the common memory. The local prototype
on `/` remains separate from that shared data.

For the authenticated service and worker:

```sh
pnpm install
cp .env.example .env      # fill in values; see below
pnpm test                 # unit tests: ingest validation, retrieval filters, schema drift
pnpm --filter @memory/web dev            # http://localhost:3000
pnpm --filter @memory/mcp-server smoke   # live end-to-end check against the dev project
pnpm --filter @memory/worker start       # outbox relay + claim analysis (needs DATABASE_URL)
```

`apps/web/.env` should be a symlink to the root `.env` (`ln -s ../../.env apps/web/.env`).
Without an OpenAI key, the MCP uses free keyword-only search; new claims have no vector.
An OpenAI key enables semantic embeddings, but is not required for the project.

## One-time Supabase setup (dashboard)

Project: `<your-project>` (`<project-ref>`).

1. **Authentication → OAuth Server**: enable it, enable **dynamic client registration**, and set the
   authorization path to `/oauth/consent` with your app URL as site URL.
2. **Authentication → URL Configuration**: site URL = your deployed app URL; add
   `https://<your-app>/auth/callback` to redirect URLs.
3. **Authentication → Providers → Email**: for a team beyond your Supabase org members, configure custom SMTP
   (Supabase's built-in mailer only delivers to org members). For local testing you can turn off
   "Confirm email" instead.
4. **Authentication → Attack Protection**: enable leaked-password protection (security advisor).
5. Apply the pending migration that removes the old `search_claims` overload:
   `npx supabase link --project-ref <project-ref> && npx supabase db push`
   (or paste `supabase/migrations/20261013193500_drop_old_search_claims.sql` into the SQL editor).
6. For the worker: copy the **session pooler** connection string (port 5432) into `DATABASE_URL`.

## Deploy (Vercel)

Import the repo, set **Root Directory** to `apps/web` (Vercel detects the pnpm workspace), and set
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
`APP_URL=https://<your-app>`. Add `OPENAI_API_KEY` only if you want semantic search. The MCP endpoint is `https://<your-app>/api/mcp`.
Run the worker anywhere that keeps a Node process alive (Railway, Fly.io, Render); phase 1 works without it,
since jobs simply queue in the outbox until it runs.

## End-to-end test with real assistants

1. Sign up in the web app, create a workspace and project, invite a teammate (or a second account).
2. **Claude**: Settings → Connectors → Add custom connector → `https://<your-app>/api/mcp`. Approve on the
   consent screen. Discuss something, then ask: "save what we decided to team memory".
3. Accept the proposed claims in the web app.
4. **ChatGPT** (as the second account): Settings → Apps & Connectors → Advanced → Developer mode → create a
   connector with the same URL, OAuth. Ask: "brief me on <project> from team memory". The decisions appear
   with the author, the Claude model, and the time.
