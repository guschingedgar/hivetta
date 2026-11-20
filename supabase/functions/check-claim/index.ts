// check-claim: the AI claim checker. Called by the database (pg_net) for
// every new claim. Compares it with its nearest neighbours in the same
// project and records one verdict through public.apply_claim_verdict:
//   new       -> accepted automatically
//   duplicate -> linked to the existing claim and rejected
//   conflict  -> linked, conflict opened, left for a human to resolve
// Any failure leaves the claim proposed (human review), which is the safe default.
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = Deno.env.get("CHECKER_MODEL") ?? "claude-haiku-5-5";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type Claim = { id: string; type: string; status: string; text: string; author_label?: string };
type Verdict = { verdict: "new" | "duplicate" | "conflict"; target: string | null; reason: string };

const SYSTEM = `You maintain a shared memory for a team whose members use different AI assistants.
Each memory is a short claim: a decision, fact, assumption or open question.
A teammate's assistant just saved a NEW claim. Compare it with the EXISTING claims and pick one verdict:

- "duplicate": an existing claim already says the same thing; the new one adds nothing.
- "conflict": the new claim and one existing claim cannot both be true or both be followed
  (for example two different choices for the same thing, or a fact and its opposite).
  This includes a new claim that changes an earlier decision: a human must confirm the change.
- "new": anything else, including claims that add detail, refine, or are about a different subject.

Not conflicts: steps of one plan in sequence ("first A" and "then B"), a plan and its next step, a general
claim and a more specific one, or two choices for different things. Only flag a conflict when following
one claim means the other is no longer true or no longer done.

Be conservative: only choose "duplicate" or "conflict" when it is clear. Unrelated or compatible
claims are "new". For duplicate or conflict, give the number of the existing claim involved.
Write the reason in one short sentence a teammate can read, in the language of the claims.
Teammates never see the numbers, so in the reason quote or paraphrase the existing claim instead.`;

const TOOL = {
  name: "record_verdict",
  description: "Record the verdict for the new claim.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["new", "duplicate", "conflict"] },
      existing_number: {
        type: ["integer", "null"],
        description: "Number of the existing claim involved; null when the verdict is new.",
      },
      reason: { type: "string", description: "One short sentence explaining the verdict." },
    },
    required: ["verdict", "existing_number", "reason"],
  },
};

async function judge(claim: Claim, neighbours: Claim[]): Promise<Verdict> {
  const existing = neighbours
    .map((n, i) => `[${i + 1}] (${n.type}, ${n.status}, by ${n.author_label ?? "unknown"}) ${n.text}`)
    .join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{
        role: "user",
        content: `NEW claim (${claim.type}): ${claim.text}\n\nEXISTING claims:\n${existing}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const call = body.content?.find((b: { type: string }) => b.type === "tool_use");
  if (!call) throw new Error("model returned no verdict");
  const { verdict, existing_number, reason } = call.input as {
    verdict: string; existing_number: number | null; reason: string;
  };
  if (verdict !== "new" && verdict !== "duplicate" && verdict !== "conflict") {
    throw new Error(`unknown verdict ${verdict}`);
  }
  const text = String(reason ?? "").trim().slice(0, 1000) || "No reason given.";
  if (verdict === "new") return { verdict, target: null, reason: text };
  const target = neighbours[(existing_number ?? 0) - 1];
  if (!target) throw new Error(`verdict ${verdict} points to missing claim ${existing_number}`);
  return { verdict, target: target.id, reason: text };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const { data: allowed } = await db.rpc("verify_checker_secret", {
    p_secret: req.headers.get("x-checker-secret") ?? "",
  });
  if (allowed !== true) return new Response("forbidden", { status: 403 });
  let claimId: string;
  try {
    claimId = String((await req.json()).claim_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(claimId)) throw new Error("bad claim_id");
  } catch {
    return new Response("bad request", { status: 400 });
  }

  try {
    const { data: claim, error } = await db
      .from("claim_view").select("id,type,status,text").eq("id", claimId).maybeSingle();
    if (error) throw error;
    if (!claim || claim.status !== "proposed") return Response.json({ skipped: true });

    const { data: neighbours, error: nErr } = await db.rpc("claim_neighbours", {
      p_claim: claimId, p_limit: 12,
    });
    if (nErr) throw nErr;

    const verdict: Verdict = (neighbours ?? []).length === 0
      ? { verdict: "new", target: null, reason: "No other claims in this project yet." }
      : await judge(claim as Claim, neighbours as Claim[]);

    const { data: applied, error: aErr } = await db.rpc("apply_claim_verdict", {
      p_claim: claimId,
      p_verdict: verdict.verdict,
      p_target: verdict.target,
      p_reason: verdict.reason,
      p_model: (neighbours ?? []).length === 0 ? "none" : MODEL,
    });
    if (aErr) throw aErr;
    return Response.json({ claim_id: claimId, applied, ...verdict });
  } catch (err) {
    console.error("[check-claim]", claimId, err);
    return new Response("check failed; claim left for human review", { status: 500 });
  }
});
