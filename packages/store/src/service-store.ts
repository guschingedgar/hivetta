import pg from "pg";
import type { ClaimView, SearchHit } from "@memory/schema";
import { toClaimView, type ClaimViewRow } from "./mapping";

/**
 * Privileged access for background work (apps/worker only). Connects as the
 * database owner, so RLS does NOT apply: every query here must filter by
 * project_id itself. Never construct this in a request-serving surface.
 */
export function createServiceStore(opts: { databaseUrl: string; max?: number }) {
  // Supabase's session pooler or a direct connection. Not the transaction
  // pooler: pg-boss and SELECT ... FOR UPDATE need session semantics.
  const pool = new pg.Pool({ connectionString: opts.databaseUrl, max: opts.max ?? 5 });

  return {
    pool,

    /**
     * Moves pending outbox rows to the queue. Rows stay locked (SKIP LOCKED, so
     * several workers can relay concurrently) until sent and marked. Each row
     * is sent with its pre-minted job id, so a crash between send and mark
     * makes the retry a no-op rather than a duplicate job.
     */
    async relayOutbox(
      send: (row: { topic: string; jobId: string; payload: unknown }) => Promise<void>,
      batchSize = 100,
    ): Promise<number> {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const { rows } = await client.query<{ id: string; topic: string; job_id: string; payload: unknown }>(
          `select id, topic, job_id, payload from app.outbox
           where dispatched_at is null order by id limit $1 for update skip locked`,
          [batchSize],
        );
        for (const r of rows) await send({ topic: r.topic, jobId: r.job_id, payload: r.payload });
        if (rows.length > 0) {
          await client.query(`update app.outbox set dispatched_at = now() where id = any($1::bigint[])`, [
            rows.map((r) => r.id),
          ]);
        }
        await client.query("commit");
        return rows.length;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async getClaim(projectId: string, claimId: string): Promise<ClaimView | null> {
      const { rows } = await pool.query<ClaimViewRow>(
        `select * from public.claim_view where project_id = $1 and id = $2`,
        [projectId, claimId],
      );
      return rows[0] ? toClaimView(isoDates(rows[0])) : null;
    },

    /** Nearest live claims in the same project by embedding, excluding the claim itself. */
    async neighbours(projectId: string, claimId: string, k = 10): Promise<SearchHit[]> {
      const { rows } = await pool.query<ClaimViewRow & { score: number }>(
        `select cv.*, 1 - (c.embedding operator(extensions.<=>) t.embedding) as score
         from public.claims t
         join public.claims c on c.project_id = t.project_id and c.id <> t.id
         join public.claim_view cv on cv.id = c.id
         where t.project_id = $1 and t.id = $2
           and t.embedding is not null and c.embedding is not null
           and c.status in ('proposed', 'accepted')
         order by c.embedding operator(extensions.<=>) t.embedding
         limit $3`,
        [projectId, claimId, k],
      );
      return rows.map((r) => ({ ...toClaimView(isoDates(r)), score: Number(r.score), matchedBy: "semantic" as const }));
    },

    end: () => pool.end(),
  };
}

export type ServiceStore = ReturnType<typeof createServiceStore>;

// node-postgres returns timestamptz as Date; the read model uses ISO strings.
function isoDates<T extends ClaimViewRow>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const k of ["created_at", "recorded_at"]) {
    if (out[k] instanceof Date) out[k] = (out[k] as Date).toISOString();
  }
  return out as T;
}
