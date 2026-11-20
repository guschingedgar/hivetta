// MCP is the first adapter, not the architecture: this file is the only place
// in ingest that knows about MCP. A browser extension would add a sibling file
// that maps its own payload into the same IngestRequest.

import type { CreateHandoffInput, ProposeClaimsInput } from "@memory/schema";
import type { HandoffRequest, HandoffResult, IngestRequest, IngestResult, Principal } from "../ingest";

export interface McpCallContext {
  principal: Principal;
  /** clientInfo.name from the MCP initialize handshake, e.g. "claude-ai". */
  clientName?: string;
}

export function fromProposeClaims(input: ProposeClaimsInput, ctx: McpCallContext): IngestRequest {
  return {
    projectId: input.project_id,
    principal: ctx.principal,
    model: input.model,
    client: ctx.clientName?.trim().slice(0, 100) || "mcp-unknown-client",
    claims: input.claims,
    rawPayload: { tool: "propose_claims", input },
    ...(input.branch?.trim() ? { branch: { name: input.branch, gitBranch: input.git_branch } } : {}),
  };
}

/** What the calling model reads back. Tells it exactly what happened and what to do next. */
export function toProposeClaimsResult(result: IngestResult) {
  const { stored, rejected, branch } = result;
  const total = stored.length + rejected.length;
  const lines = [
    branch
      ? `Stored ${stored.length} of ${total} claim(s) as drafts in branch "${branch}".`
      : `Stored ${stored.length} of ${total} claim(s) with status "proposed".`,
    stored.length && branch
      ? "Drafts stay out of the team's shared memory: teammates' briefs and searches do not show them, and they " +
        "are not checked yet. Tell the user; when the work is decided, merge_branch sends them through the AI " +
        "reviewer into the shared memory."
      : null,
    stored.length && !branch
      ? "They are searchable by the team now. Within seconds an AI reviewer checks each one against the existing " +
        "memory: new claims are accepted, duplicates are set aside, and a claim that contradicts an accepted one " +
        "stays proposed until a teammate resolves the conflict."
      : null,
    rejected.length
      ? `${rejected.length} claim(s) rejected. Fix each one using its reasons and resubmit only those; the stored ones must not be sent again.`
      : null,
  ].filter(Boolean);

  return {
    summary: lines.join(" "),
    ...(branch ? { branch } : {}),
    stored: stored.map((c) => ({ id: c.id, type: c.type, status: c.status, text: c.text })),
    rejected: rejected.map((r) => ({ index: r.index, text: r.text, reasons: r.reasons })),
  };
}

function clientOf(ctx: McpCallContext): string {
  return ctx.clientName?.trim().slice(0, 100) || "mcp-unknown-client";
}

export function fromCreateHandoff(input: CreateHandoffInput, ctx: McpCallContext): HandoffRequest {
  const { project_id, model, claims, ...handoff } = input;
  return {
    projectId: project_id,
    principal: ctx.principal,
    model,
    client: clientOf(ctx),
    handoff,
    claims: claims ?? [],
    rawPayload: { tool: "create_handoff", input },
  };
}

export function toCreateHandoffResult(result: HandoffResult) {
  const { handoff, rejected } = result;
  const lines = [
    `Handoff "${handoff.title}" saved${handoff.recipient ? ` for ${handoff.recipient}` : ""}.`,
    handoff.claims.length
      ? `${handoff.claims.length} claim(s) saved with it; the AI reviewer checks them against the existing memory within seconds.`
      : null,
    rejected.length
      ? `${rejected.length} claim(s) were left out. Fix each one using its reasons and save them with propose_claims; do not create the handoff again.`
      : null,
    "Tell the user the next person can pick it up from any AI assistant connected to Hivetta, " +
      "for example by asking it to get the latest handoffs for this project.",
  ].filter(Boolean);
  return {
    summary: lines.join(" "),
    handoff_id: handoff.id,
    claims: handoff.claims.map((c) => ({ id: c.id, type: c.type, status: c.status, text: c.text })),
    rejected: rejected.map((r) => ({ index: r.index, text: r.text, reasons: r.reasons })),
  };
}
