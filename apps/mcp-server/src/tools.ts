import { z } from "zod";
import type { AutoSave } from "@memory/store";
import type { McpServer } from "@modelcontextprotocol/server";
import type { Embedder } from "@memory/embeddings";
import { createHandoff, ingestClaims, IngestError, parseBranch, type Principal } from "@memory/ingest";
import { fromCreateHandoff, fromProposeClaims, toCreateHandoffResult, toProposeClaimsResult } from "@memory/ingest/adapters/mcp";
import { getBranch, getProjectBrief, listBranches, listHandoffs, listOpenQuestions, listProjects, searchMemory } from "@memory/retrieval";
import {
  CreateHandoffInput,
  GetHandoffsInput,
  GetProjectBriefInput,
  ListBranchesInput,
  ListOpenQuestionsInput,
  MergeBranchInput,
  ListProjectsInput,
  ProposeClaimsInput,
  SearchMemoryInput,
} from "@memory/schema";
import { StoreError, type UserStore } from "@memory/store";
import { branchForModel, briefForModel, claimForModel, handoffForModel, hitForModel } from "./format";

export interface ToolDeps {
  store: UserStore;
  embedder: Embedder;
  principal: Principal;
  /** Best-effort name of the calling client, resolved per call. */
  clientName: (meta: unknown) => string | undefined;
  /** The caller's auto-save setting, read once per request. */
  autoSave?: AutoSave;
  /** The caller's display name (or email), used to name their auto-save draft space. */
  displayName?: string;
}

/** Text added to the save tool's description when auto-save is on. */
const AUTO_SAVE_RULES: Record<Exclude<AutoSave, "off">, string> = {
  drafts:
    "AUTO-SAVE IS ON for this user (to drafts). Do not wait to be asked: whenever the conversation clearly settles a " +
    "decision, establishes a fact, states a working assumption or raises an open question that matters to the " +
    "project, call this tool with auto: true. Save only what was actually settled, not brainstorming, options " +
    "still being weighed or anything the user is unsure about. Batch related claims in one call rather than " +
    "calling after every message. These saves go to the user's automatic draft space, which the user reviews " +
    "and merges later. After saving, tell the user in one short line what you saved. If the user asks you to " +
    "stop auto-saving in this conversation, stop.",
  memory:
    "AUTO-SAVE IS ON for this user (straight to memory). Do not wait to be asked: whenever the conversation " +
    "clearly settles a decision, establishes a fact, states a working assumption or raises an open question that " +
    "matters to the project, call this tool with auto: true. Save only what was actually settled, not " +
    "brainstorming, options still being weighed or anything the user is unsure about. Batch related claims in " +
    "one call rather than calling after every message. After saving, tell the user in one short line what you " +
    "saved. If the user asks you to stop auto-saving in this conversation, stop.",
};

/** The save tool's description for this caller's auto-save setting. */
function proposeDescription(mode: AutoSave = "off") {
  if (mode === "off") return DESCRIPTIONS.propose_claims;
  return DESCRIPTIONS.propose_claims.replace("Do not call it unprompted.", AUTO_SAVE_RULES[mode]);
}

/** The open draft space auto-saves go to, e.g. "auto/edgar-20261111"; a new one once the last is merged. */
async function autoBranch(deps: ToolDeps, projectId: string): Promise<string> {
  const slug = (deps.displayName ?? "me").toLowerCase().split("@")[0]!.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "me";
  const prefix = `auto/${slug}`;
  const branches = await deps.store.listBranches(projectId);
  const open = branches.find((b) => b.status === "open" && b.name.startsWith(prefix));
  if (open) return open.name;
  const d = new Date();
  const day = d.toISOString().slice(0, 10).replace(/-/g, "");
  let name = `${prefix}-${day}`;
  if (branches.some((b) => b.name === name)) name = `${name}-${d.toISOString().slice(11, 16).replace(":", "")}`;
  return name;
}

// Tool descriptions are the prompt the calling model reads to decide when to
// call a tool and what to send. They are written for a model with no other
// context about this system.

const DESCRIPTIONS = {
  list_projects:
    "List the projects in Hivetta (the team's shared memory) that the user can access: each project's id, name, " +
    "workspace and the user's role. Call this first whenever you need a project_id, or when the user names " +
    "a project and you need to find it. Role decides what is allowed: viewer can read; contributor and admin " +
    "can also save claims.",

  propose_claims:
    "Save what matters from this conversation to Hivetta, the team's shared memory, so teammates using any AI " +
    "assistant can retrieve it later. Call it when the user asks to save, remember, record or log what was " +
    "decided or learned, typically at the end of a conversation. Do not call it unprompted.\n\n" +
    "Send one claim per decision, fact, assumption or open question. Write each claim for a teammate who " +
    "never saw this conversation:\n" +
    "- Name the subject explicitly. Never start with 'It', 'This', 'That' or 'They'.\n" +
    "- Never refer to the conversation ('as discussed above', 'you said'). State the content itself.\n" +
    "- For a decision, include the reason in the same sentence.\n" +
    "- Open questions end with '?'; nothing else does.\n" +
    "- Leave out anything the user did not confirm, and anything already in memory (search_memory first if unsure).\n\n" +
    "Give each claim its context, so teammates understand it later without the conversation:\n" +
    "- 'why': for decisions and assumptions, summarise the reasoning: the problem, the alternatives considered " +
    "and why they lost, the constraint that drove the choice. A few plain sentences, not a transcript.\n" +
    "- 'details': extra context worth keeping (numbers, scope, edge cases, what is still unknown). Optional.\n" +
    "- 'links': full URLs mentioned in the conversation that back the claim up. Optional.\n" +
    "Never put secrets, passwords or unrelated personal details in any field.\n\n" +
    "Claims are stored with status 'proposed' and full provenance: the user, your model name, the client and " +
    "the time. Within seconds an AI reviewer compares each one with the existing memory: a new claim is " +
    "accepted, a duplicate is linked to the existing claim, and a claim that contradicts an accepted one stays " +
    "proposed until a teammate resolves the conflict. Nothing you send can change or delete " +
    "existing knowledge. The response lists what was stored and, for each rejected claim, the reasons: fix " +
    "and resubmit only the rejected ones.\n\n" +
    "Branches: when the user is exploring and has not decided yet, or asks to keep work in a branch, pass " +
    "'branch' to save the claims as drafts there instead. Drafts stay out of the shared memory until the user " +
    "asks to merge the branch (merge_branch).",

  search_memory:
    "Search Hivetta, the team's shared memory, for decisions, facts, assumptions and open questions related to a " +
    "query. Matches meaning as well as exact terms such as names, IDs and error codes. Use it before " +
    "answering questions about the project's past choices, before saving claims that may already exist, and " +
    "whenever the user asks what the team knows.\n\n" +
    "Every result has a status and provenance. 'accepted' means a human reviewed it; 'proposed' means not yet " +
    "reviewed. Treat proposed claims as unconfirmed and say so when you rely on one. Cite who saved a claim " +
    "and when if it matters. Superseded and rejected claims are left out unless you request them through " +
    "filters.statuses, for example to explain how a decision changed.",

  get_project_brief:
    "Get a compact briefing on a project: its accepted decisions, key facts, working assumptions and open " +
    "questions, newest first, each with provenance, plus the latest handoffs (notes teammates left when " +
    "passing on their part of the work, with next steps and links). Call it at the start of any conversation " +
    "about a project, and whenever the user is picking up or taking over someone's work, so you build on " +
    "what the team already decided instead of deciding it again. Only accepted claims appear " +
    "(plus open questions), so treat the brief as authoritative; use search_memory to also see proposed claims, " +
    "including ones held back because they conflict with an accepted claim.",

  list_open_questions:
    "List the questions the team has recorded as unresolved for a project, newest first, with who raised " +
    "each one and when. Use it when the user asks what is still open or undecided, or before planning work, " +
    "so open questions are not mistaken for settled decisions.",

  create_handoff:
    "Hand a piece of work over to a teammate through Hivetta, so the next person, in any AI " +
    "assistant, can pick it up without this conversation. Call it when the user says they are done with " +
    "their part, wants to hand it off, pass it on or brief whoever takes over. Do not call it unprompted.\n\n" +
    "Before calling, draft the handoff and show the user the title, summary and next steps; save it once " +
    "they agree (unless they dictated it). Write for someone who never saw this conversation:\n" +
    "- summary: what exists now, what works, what does not yet, and any trap the next person must know.\n" +
    "- next_steps: concrete actions, most important first.\n" +
    "- links: the repository, branch, pull request, files or documents where the work lives. Only links " +
    "that appeared in the conversation or that the user gives you; never invent a URL.\n" +
    "- claims: the decisions, facts, assumptions and open questions of this part, with the same writing " +
    "rules as propose_claims. Do not repeat claims already in memory (search_memory first if unsure).\n" +
    "- recipient: the teammate who takes over, if the user named one.\n\n" +
    "The handoff is stored with full provenance and cannot be edited afterwards; claims are checked by the AI " +
    "reviewer like any saved claim. To correct a handoff, create a new one that says what changed.",

  get_handoffs:
    "Get the latest handoffs for a project, newest first: notes teammates left when passing on their part of " +
    "the work, each with a summary, next steps, links to where the work lives, and the claims recorded with " +
    "it (with their current status). Call it when the user is picking up, taking over or continuing someone " +
    "else's work, asks what a teammate left them, or when get_project_brief lists a recent handoff relevant " +
    "to the user's task. Start from the summary and next steps, open the links for the actual work, and " +
    "treat claims that are still 'proposed' as unconfirmed.",

  list_branches:
    "List a project's branches: draft spaces where a teammate saves claims that are not decided yet, kept out " +
    "of the shared memory until merged. Each branch has a status (open, merged, abandoned), the git branch it " +
    "matches if any, and how many drafts it holds. Pass 'name' to read one branch's draft claims. Use it when " +
    "the user asks about branches or drafts, or before merging. Drafts are not team decisions: never present " +
    "them as such.",

  merge_branch:
    "Merge a branch into the shared memory. Call it only when the user explicitly asks to merge or says the " +
    "branch's work is decided. Every draft in the branch then goes through the AI reviewer against the shared " +
    "memory within seconds: new claims are accepted, duplicates are set aside, and a claim that contradicts an " +
    "accepted one stays proposed until a teammate resolves the conflict. The branch is then closed for good " +
    "(later work needs a new branch name). Tell the user how many drafts were sent; search_memory shows the " +
    "outcome shortly after.",
} as const;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function registerTools(server: McpServer, deps: ToolDeps) {
  server.registerTool(
    "list_projects",
    { title: "List projects", description: DESCRIPTIONS.list_projects, inputSchema: ListProjectsInput, annotations: READ_ONLY },
    () =>
      run(async () => {
        const projects = await listProjects(deps);
        return {
          projects: projects.map((p) => ({ id: p.id, name: p.name, workspace: p.workspaceName, your_role: p.role })),
          ...(projects.length === 0
            ? { note: "No projects yet. The user can create one in the web app, or ask a workspace admin for access." }
            : {}),
        };
      }),
  );

  server.registerTool(
    "propose_claims",
    {
      title: "Save to Hivetta",
      description: proposeDescription(deps.autoSave),
      inputSchema: ProposeClaimsInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (input, ctx) =>
      run(async () => {
        // Auto-saves land in the person's automatic draft space when they chose "to drafts".
        if (input.auto && deps.autoSave === "drafts" && !input.branch?.trim()) {
          input = { ...input, branch: await autoBranch(deps, input.project_id) };
        }
        const request = fromProposeClaims(input, {
          principal: deps.principal,
          clientName: deps.clientName(ctx.mcpReq._meta),
        });
        const result = await ingestClaims(deps, request);
        return toProposeClaimsResult(result);
      }),
  );

  server.registerTool(
    "search_memory",
    { title: "Search Hivetta", description: DESCRIPTIONS.search_memory, inputSchema: SearchMemoryInput, annotations: READ_ONLY },
    (input) =>
      run(async () => {
        const { hits, degraded } = await searchMemory(deps, input);
        return {
          results: hits.map(hitForModel),
          ...(hits.length === 0 ? { note: "Nothing matched. Try other wording, or relax the filters." } : {}),
          ...(degraded ? { warning: "Semantic search is unavailable; these are exact keyword matches only." } : {}),
        };
      }),
  );

  server.registerTool(
    "get_project_brief",
    { title: "Project brief", description: DESCRIPTIONS.get_project_brief, inputSchema: GetProjectBriefInput, annotations: READ_ONLY },
    (input) => run(async () => briefForModel(await getProjectBrief(deps, input.project_id))),
  );

  server.registerTool(
    "create_handoff",
    {
      title: "Hand off work to a teammate",
      description: DESCRIPTIONS.create_handoff,
      inputSchema: CreateHandoffInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (input, ctx) =>
      run(async () => {
        const request = fromCreateHandoff(input, {
          principal: deps.principal,
          clientName: deps.clientName(ctx.mcpReq._meta),
        });
        return toCreateHandoffResult(await createHandoff(deps, request));
      }),
  );

  server.registerTool(
    "get_handoffs",
    { title: "Get handoffs", description: DESCRIPTIONS.get_handoffs, inputSchema: GetHandoffsInput, annotations: READ_ONLY },
    (input) =>
      run(async () => {
        const handoffs = await listHandoffs(deps, input.project_id, input.limit);
        return {
          handoffs: handoffs.map(handoffForModel),
          ...(handoffs.length === 0 ? { note: "No handoffs in this project yet." } : {}),
        };
      }),
  );

  server.registerTool(
    "list_branches",
    { title: "List branches", description: DESCRIPTIONS.list_branches, inputSchema: ListBranchesInput, annotations: READ_ONLY },
    (input) =>
      run(async () => {
        if (input.name?.trim()) {
          const { branch, drafts } = await getBranch(deps, input.project_id, input.name);
          return {
            branch: branchForModel(branch),
            drafts: drafts.map(claimForModel),
            note:
              branch.status === "merged"
                ? "This branch is merged: its claims are part of the shared memory now (search_memory finds them)."
                : branch.status === "abandoned"
                  ? "This branch was abandoned: its drafts never entered the shared memory."
                  : "These are drafts, not team decisions. merge_branch sends them through the AI reviewer into the shared memory.",
          };
        }
        const branches = await listBranches(deps, input.project_id);
        return {
          branches: branches.map(branchForModel),
          ...(branches.length === 0 ? { note: "No branches yet. Claims saved with propose_claims and a 'branch' name create one." } : {}),
        };
      }),
  );

  server.registerTool(
    "merge_branch",
    {
      title: "Merge a branch",
      description: DESCRIPTIONS.merge_branch,
      inputSchema: MergeBranchInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (input) =>
      run(async () => {
        const name = parseBranch(input.name);
        const { claimsSent } = await deps.store.mergeBranch(input.project_id, name);
        return {
          summary:
            `Branch "${name}" merged. ${claimsSent} draft(s) sent to the AI reviewer; within seconds each is accepted ` +
            "into the shared memory, set aside as a duplicate, or held for a teammate if it conflicts with an accepted " +
            "claim. The branch is now closed.",
          branch: name,
          drafts_sent: claimsSent,
        };
      }),
  );

  server.registerTool(
    "list_open_questions",
    { title: "Open questions", description: DESCRIPTIONS.list_open_questions, inputSchema: ListOpenQuestionsInput, annotations: READ_ONLY },
    (input) =>
      run(async () => {
        const questions = await listOpenQuestions(deps, input.project_id);
        return { open_questions: questions.map(claimForModel) };
      }),
  );
}

/**
 * Runs a tool body and turns expected failures into tool errors the model can
 * read and act on, rather than protocol errors it cannot.
 */
async function run(body: () => Promise<Record<string, unknown>>) {
  try {
    const result = await body();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  } catch (err) {
    return { isError: true, content: [{ type: "text" as const, text: toolErrorMessage(err) }] };
  }
}

function toolErrorMessage(err: unknown): string {
  if (err instanceof IngestError) return err.message;
  if (err instanceof z.ZodError) {
    return `Invalid input: ${err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`;
  }
  if (err instanceof StoreError) {
    if ((err.code === "not_found" || err.code === "forbidden") && /branch/i.test(err.message)) {
      return "That branch does not exist in this project, or the user may not merge it (contributors and admins can). " +
        "Call list_branches to see the project's branches.";
    }
    if (err.code === "not_found" || err.code === "forbidden") {
      return "That project does not exist or the user has no access to it. Call list_projects to see available projects.";
    }
    if (err.code === "invalid") return `Rejected by the database: ${err.message}`;
  }
  console.error("[mcp] tool failed", err);
  return "Internal error. Nothing was changed. Retry shortly.";
}
