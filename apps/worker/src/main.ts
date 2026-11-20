// Background surface: relays the outbox into pg-boss and runs claim analysis.
// Wiring only; the logic lives in @memory/reasoner and @memory/store.

import { analyseClaim, noopReasoner } from "@memory/reasoner";
import { createQueue, createServiceStore, QUEUES, type ClaimAnalysePayload } from "@memory/store/service";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set (session pooler or direct connection; see .env.example)");
  process.exit(1);
}

const RELAY_BATCH = 100;
const RELAY_IDLE_MS = 2_000;

const service = createServiceStore({ databaseUrl });
const queue = await createQueue({ databaseUrl });
let stopping = false;

await queue.work<ClaimAnalysePayload>(QUEUES.claimAnalyse, async (data, jobId) => {
  const verdict = await analyseClaim(
    { loadClaim: service.getClaim, neighbours: service.neighbours, reasoner: noopReasoner },
    { projectId: data.project_id, claimId: data.claim_id },
  );
  console.log(JSON.stringify({ event: "claim.analysed", jobId, claimId: data.claim_id, verdict }));
});

async function relayLoop() {
  while (!stopping) {
    try {
      const sent = await service.relayOutbox(
        (row) => queue.send(row.topic, row.payload as object, { id: row.jobId }),
        RELAY_BATCH,
      );
      if (sent > 0) console.log(JSON.stringify({ event: "outbox.relayed", count: sent }));
      if (sent === RELAY_BATCH) continue; // backlog: drain without sleeping
    } catch (err) {
      console.error("[relay]", err);
    }
    await new Promise((r) => setTimeout(r, RELAY_IDLE_MS));
  }
}

const relay = relayLoop();
console.log(JSON.stringify({ event: "worker.started", queues: Object.values(QUEUES) }));

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ event: "worker.stopping", signal }));
  await relay;
  await queue.stop();
  await service.end();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
