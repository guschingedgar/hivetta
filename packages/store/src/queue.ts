import { PgBoss } from "pg-boss";

/** Every queue in the system. Payload types live next to their names. */
export const QUEUES = {
  claimAnalyse: "claim.analyse",
} as const;

export interface ClaimAnalysePayload {
  claim_id: string;
  project_id: string;
}

/**
 * pg-boss, owned by store because it is database access like any other.
 * Jobs live in the `pgboss` schema of the same Postgres.
 */
export async function createQueue(opts: { databaseUrl: string }) {
  const boss = new PgBoss(opts.databaseUrl);
  boss.on("error", (err) => console.error("[queue]", err));
  await boss.start();
  await boss.createQueue(QUEUES.claimAnalyse, {
    // Phase 2 calls an LLM here: expect transient failures, back off, then park.
    retryLimit: 5,
    retryDelay: 10,
    retryBackoff: true,
  });

  return {
    async send(name: string, data: object, opts?: { id?: string }) {
      await boss.send(name, data, opts);
    },
    async work<T extends object>(name: string, handler: (data: T, jobId: string) => Promise<void>) {
      await boss.work<T>(name, { batchSize: 5 }, async (jobs) => {
        // Throwing fails the remaining jobs in the batch, which pg-boss retries.
        for (const job of jobs) await handler(job.data, job.id);
      });
    },
    stop: () => boss.stop({ graceful: true }),
  };
}

export type Queue = Awaited<ReturnType<typeof createQueue>>;
