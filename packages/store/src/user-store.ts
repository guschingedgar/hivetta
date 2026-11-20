import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  BRANCH_STATUSES,
  LIMITS,
  LIVE_STATUSES,
  type ClaimStatus,
  type ClaimType,
  type BranchStatus,
  type BranchView,
  type ClaimView,
  type HandoffFields,
  type HandoffView,
  type MemberRole,
  type Provenance,
  type SearchHit,
} from "@memory/schema";
import type { Database, Json } from "./database.types";
import { StoreError, toStoreError } from "./errors";

export const AUTO_SAVE = ["off", "drafts", "memory"] as const;
export type AutoSave = (typeof AUTO_SAVE)[number];
import { CLAIM_VIEW_COLUMNS, toClaimView, toSearchHit } from "./mapping";

export interface UserStoreConfig {
  url: string;
  publishableKey: string;
  /** The caller's Supabase access token. Every query runs as this user, under RLS. */
  accessToken: string;
  /** `sub` of that token. Used for "my role" lookups, never for authorisation. */
  userId: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: MemberRole;
}

export interface ProjectSummary {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  role: MemberRole;
  createdAt: string;
}

export interface Member {
  userId: string;
  email: string;
  role: MemberRole;
  createdAt: string;
}

export interface PendingInvitation {
  email: string;
  role: MemberRole;
  createdAt: string;
}

export interface NewSource {
  projectId: string;
  provenance: Provenance;
  /** The request exactly as received, kept for audit and re-processing. */
  rawPayload: unknown;
}

/** Where a batch of claims goes: main memory (no branch) or a draft branch. */
export interface ClaimTarget {
  branch?: string;
  /** Recorded only when the branch is created. */
  gitBranch?: string;
}

export interface NewClaim {
  text: string;
  type: ClaimType;
  confidence?: number;
  /** Reasoning behind the claim (stored as `rationale`). */
  why?: string;
  details?: string;
  links?: string[];
  embedding: number[] | null;
  embeddingModel: string | null;
}

export interface ClaimQuery {
  statuses?: readonly ClaimStatus[];
  types?: readonly ClaimType[];
  limit?: number;
}

export interface SearchParams {
  query: string;
  embedding: number[] | null;
  /** Model that produced `embedding`; only claims embedded by it are ranked by vector. */
  embeddingModel: string | null;
  types?: readonly ClaimType[];
  statuses?: readonly ClaimStatus[];
  authorId?: string;
  model?: string;
  since?: string;
  limit: number;
}

export interface ConflictView {
  id: string;
  projectId: string;
  status: "open" | "resolved" | "dismissed";
  /** The checker's explanation of why the two claims disagree. */
  reason: string | null;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  claimA: ClaimView | null;
  claimB: ClaimView | null;
}

/** Everything known about one memory, for the detail panel. */
export interface ClaimDetail {
  claim: ClaimView;
  /** The AI checker's verdict, if it ran. */
  check: { verdict: "new" | "duplicate" | "conflict"; reason: string; model: string; createdAt: string; target: ClaimView | null } | null;
  /** Links to other memories: replaced by / replaces / duplicate of / contradicts, with who and why. */
  links: { type: string; direction: "out" | "in"; reason: string; byHuman: boolean; createdAt: string; other: ClaimView | null }[];
  conflicts: ConflictView[];
  /** Other memories saved in the same call (same conversation). */
  savedWith: ClaimView[];
  handoff: HandoffView | null;
}

/** The handoff fields after validation; next_steps and links already defaulted. */
export type NewHandoff = HandoffFields;

export type UserStore = ReturnType<typeof createUserStore>;

/**
 * The only way the application reads or writes Postgres on behalf of a user.
 * Authorisation is not checked here: RLS, column grants and triggers in the
 * database decide, and their refusals come back as StoreError.
 */
export function createUserStore(config: UserStoreConfig) {
  const db: SupabaseClient<Database> = createClient<Database>(config.url, config.publishableKey, {
    accessToken: async () => config.accessToken,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  async function myRoles(): Promise<Map<string, MemberRole>> {
    const { data, error } = await db
      .from("members")
      .select("workspace_id, role")
      .eq("user_id", config.userId);
    if (error) throw toStoreError(error);
    return new Map(data.map((m) => [m.workspace_id, m.role as MemberRole]));
  }

  return {
    userId: config.userId,

    // ---- tenancy -------------------------------------------------------

    async listWorkspaces(): Promise<WorkspaceSummary[]> {
      const [roles, { data, error }] = await Promise.all([
        myRoles(),
        db.from("workspaces").select("id, name").order("created_at"),
      ]);
      if (error) throw toStoreError(error);
      return data.map((w) => ({ id: w.id, name: w.name, role: roles.get(w.id) ?? "viewer" }));
    },

    async createWorkspace(name: string): Promise<string> {
      const { data, error } = await db.rpc("create_workspace", { p_name: name });
      if (error) throw toStoreError(error);
      return data;
    },

    async listProjects(): Promise<ProjectSummary[]> {
      const [roles, { data, error }] = await Promise.all([
        myRoles(),
        db.from("projects").select("id, name, workspace_id, created_at, workspaces(name)").order("name"),
      ]);
      if (error) throw toStoreError(error);
      return data.map((p) => ({
        id: p.id,
        name: p.name,
        workspaceId: p.workspace_id,
        workspaceName: p.workspaces?.name ?? "",
        role: roles.get(p.workspace_id) ?? "viewer",
        createdAt: p.created_at,
      }));
    },

    async getProject(projectId: string): Promise<ProjectSummary> {
      const projects = await this.listProjects();
      const project = projects.find((p) => p.id === projectId);
      // Missing and forbidden look identical on purpose: no existence oracle.
      if (!project) throw new StoreError("not_found", `project ${projectId} not found or not accessible`);
      return project;
    },

    async createProject(workspaceId: string, name: string): Promise<string> {
      const { data, error } = await db
        .from("projects")
        .insert({ workspace_id: workspaceId, name })
        .select("id")
        .single();
      if (error) throw toStoreError(error);
      return data.id;
    },

    async listMembers(workspaceId: string): Promise<Member[]> {
      const { data, error } = await db.rpc("workspace_members", { p_workspace_id: workspaceId });
      if (error) throw toStoreError(error);
      return data.map((m) => ({ userId: m.user_id, email: m.email, role: m.role as MemberRole, createdAt: m.created_at }));
    },

    async listInvitations(workspaceId: string): Promise<PendingInvitation[]> {
      const { data, error } = await db
        .from("invitations")
        .select("email, role, created_at")
        .eq("workspace_id", workspaceId)
        .is("accepted_at", null)
        .order("created_at");
      if (error) throw toStoreError(error);
      return data.map((i) => ({ email: i.email, role: i.role as MemberRole, createdAt: i.created_at }));
    },

    /** Adds the user now if they have an account, otherwise when they confirm their email. */
    async inviteMember(workspaceId: string, email: string, role: MemberRole): Promise<"added" | "invited" | "member"> {
      const { data, error } = await db.rpc("invite_member", {
        p_workspace_id: workspaceId,
        p_email: email,
        p_role: role,
      });
      if (error) throw toStoreError(error);
      return data as "added" | "invited" | "member";
    },

    /** Removes someone from a workspace (admins, from the web app; never yourself). Their saved memories stay, with their name. */
    async removeMember(workspaceId: string, userId: string): Promise<void> {
      const { data, error } = await db.from("members").delete().eq("workspace_id", workspaceId).eq("user_id", userId).select("user_id");
      if (error) throw toStoreError(error);
      if (data.length === 0) throw new StoreError("forbidden", "You can't remove this person.");
    },

    /** Cancels an invitation that hasn't been used yet (admins, from the web app). */
    async cancelInvitation(workspaceId: string, email: string): Promise<void> {
      const { data, error } = await db.from("invitations").delete().eq("workspace_id", workspaceId).eq("email", email.toLowerCase()).is("accepted_at", null).select("id");
      if (error) throw toStoreError(error);
      if (data.length === 0) throw new StoreError("forbidden", "You can't cancel this invitation.");
    },

    // ---- knowledge: writes ---------------------------------------------

    /**
     * Writes one source (the provenance of this call) and its claims in a
     * single transaction via the ingest_claims RPC. author_id is taken from
     * the token inside Postgres, so provenance cannot be forged. Returns the
     * stored claims in input order.
     */
    async ingest(source: NewSource, claims: readonly NewClaim[], target: ClaimTarget = {}): Promise<ClaimView[]> {
      if (claims.length === 0) return [];
      const p = source.provenance;
      const { data, error } = await db.rpc("ingest_claims", {
        p_project_id: source.projectId,
        p_author_label: p.authorLabel,
        p_model: p.model,
        p_client: p.client,
        // Nullable in SQL; the type generator marks every function argument as required.
        p_client_id: p.clientId as string,
        p_raw_payload: source.rawPayload as Json,
        p_claims: claims.map((c) => ({
          text: c.text,
          type: c.type,
          confidence: c.confidence ?? null,
          rationale: c.why ?? null,
          details: c.details ?? null,
          links: c.links ?? null,
          embedding: c.embedding ? JSON.stringify(c.embedding) : null,
          embedding_model: c.embeddingModel,
        })),
        ...(target.branch ? { p_branch: target.branch, p_git_branch: target.gitBranch } : {}),
      });
      if (error) throw toStoreError(error);
      // Ingest rejects in-batch duplicates before this point, so text is a unique key here.
      const idByText = new Map(data.map((r) => [r.text, r.id]));
      const ids = claims.map((c) => idByText.get(c.text)!);
      return target.branch ? this.getBranchClaims(source.projectId, { ids }) : this.getClaims(ids);
    },

    /**
     * Writes one source, the handoff, its claims and the links between them
     * in a single transaction via the create_handoff RPC. Like ingest,
     * author_id comes from the token inside Postgres.
     */
    async createHandoff(source: NewSource, handoff: NewHandoff, claims: readonly NewClaim[]): Promise<HandoffView> {
      const p = source.provenance;
      const { data, error } = await db.rpc("create_handoff", {
        p_project_id: source.projectId,
        p_author_label: p.authorLabel,
        p_model: p.model,
        p_client: p.client,
        // Nullable in SQL; the type generator marks every function argument as required.
        p_client_id: p.clientId as string,
        p_raw_payload: source.rawPayload as Json,
        p_title: handoff.title,
        p_area: (handoff.area ?? null) as string,
        p_recipient: (handoff.recipient ?? null) as string,
        p_summary: handoff.summary,
        p_next_steps: handoff.next_steps,
        p_links: handoff.links as Json,
        p_claims: claims.map((c) => ({
          text: c.text,
          type: c.type,
          confidence: c.confidence ?? null,
          embedding: c.embedding ? JSON.stringify(c.embedding) : null,
          embedding_model: c.embeddingModel,
        })),
      });
      if (error) throw toStoreError(error);
      const handoffId = data[0]?.handoff_id;
      if (!handoffId) throw new StoreError("unavailable", "create_handoff returned no handoff");
      const [view] = await this.getHandoffs(source.projectId, [handoffId]);
      if (!view) throw new StoreError("unavailable", `handoff ${handoffId} not readable after insert`);
      return view;
    },

    async setClaimStatus(claimId: string, status: "accepted" | "rejected"): Promise<ClaimView> {
      const { data, error } = await db.from("claims").update({ status }).eq("id", claimId).select("id");
      if (error) throw toStoreError(error);
      // RLS filters an unauthorised update to zero rows rather than raising.
      if (data.length === 0) throw new StoreError("forbidden", `claim ${claimId} not found or not permitted`);
      const [claim] = await this.getClaims([claimId]);
      return claim!;
    },

    /** Records a supersedes edge and marks the old claim, atomically. */
    async supersedeClaim(oldClaimId: string, newClaimId: string, reason: string): Promise<void> {
      const { error } = await db.rpc("supersede_claim", {
        p_old_claim: oldClaimId,
        p_new_claim: newClaimId,
        p_reason: reason,
      });
      if (error) throw toStoreError(error);
    },

    // ---- knowledge: reads ----------------------------------------------

    async getClaims(ids: readonly string[]): Promise<ClaimView[]> {
      if (ids.length === 0) return [];
      const { data, error } = await db.from("claim_view").select(CLAIM_VIEW_COLUMNS).in("id", [...ids]);
      if (error) throw toStoreError(error);
      const byId = new Map(data.map((r) => [r.id!, toClaimView(r)]));
      return ids.flatMap((id) => byId.get(id) ?? []);
    },

    async listClaims(projectId: string, q: ClaimQuery = {}): Promise<ClaimView[]> {
      let query = db
        .from("claim_view")
        .select(CLAIM_VIEW_COLUMNS)
        .eq("project_id", projectId)
        .in("status", [...(q.statuses ?? LIVE_STATUSES)]);
      if (q.types) query = query.in("type", [...q.types]);
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(Math.min(q.limit ?? 200, 500));
      if (error) throw toStoreError(error);
      return data.map(toClaimView);
    },

    /** Sources the signed-in user recorded (newest first): which assistants they have saved from. */
    async listMySources(limit = 100): Promise<{ client: string; model: string; projectId: string; createdAt: string }[]> {
      const { data, error } = await db
        .from("sources")
        .select("client, model, project_id, created_at")
        .eq("author_id", config.userId)
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 500));
      if (error) throw toStoreError(error);
      return data.map((s) => ({ client: s.client, model: s.model, projectId: s.project_id, createdAt: s.created_at }));
    },

    /** The signed-in person's display name, or null if they have not picked one yet. */
    async getMyName(): Promise<string | null> {
      const { data, error } = await db.from("profiles").select("display_name").eq("user_id", config.userId).maybeSingle();
      if (error) throw toStoreError(error);
      return data?.display_name ?? null;
    },

    /** Sets the signed-in person's display name (first-party web sessions only, enforced by RLS). */
    async setMyName(name: string): Promise<void> {
      const display_name = name.trim().replace(/\s+/g, " ").slice(0, 40);
      if (!display_name) throw new StoreError("invalid", "A name can't be empty.");
      // Update, else insert: an upsert would also write user_id on conflict, which is not granted.
      const upd = await db.from("profiles").update({ display_name, updated_at: new Date().toISOString() }).eq("user_id", config.userId).select("user_id");
      if (upd.error) throw toStoreError(upd.error);
      if (upd.data.length > 0) return;
      const { error } = await db.from("profiles").insert({ user_id: config.userId, display_name });
      if (error) throw toStoreError(error);
    },

    /** The signed-in person's auto-save setting: off, to a draft space, or straight to memory. */
    async getAutoSave(): Promise<AutoSave> {
      const { data, error } = await db.from("profiles").select("auto_save").eq("user_id", config.userId).maybeSingle();
      if (error) throw toStoreError(error);
      return (AUTO_SAVE.includes(data?.auto_save as AutoSave) ? data!.auto_save : "off") as AutoSave;
    },

    /** Changes the auto-save setting (the person themselves, from the web app). */
    async setAutoSave(mode: AutoSave): Promise<void> {
      if (!AUTO_SAVE.includes(mode)) throw new StoreError("invalid", "Unknown auto-save mode.");
      const { data, error } = await db.from("profiles").update({ auto_save: mode }).eq("user_id", config.userId).select("user_id");
      if (error) throw toStoreError(error);
      if (data.length === 0) throw new StoreError("invalid", "Pick your name first, then turn on auto-save.");
    },

    /** Display names of people you share a workspace with, by user id. */
    async namesFor(userIds: readonly string[]): Promise<Map<string, string>> {
      const ids = [...new Set(userIds.filter(Boolean))];
      if (ids.length === 0) return new Map();
      const { data, error } = await db.from("profiles").select("user_id, display_name").in("user_id", ids);
      if (error) throw toStoreError(error);
      return new Map(data.map((r) => [r.user_id, r.display_name]));
    },

    /** Recent handoffs of a project, newest first, each with its claims' current status. */
    async listHandoffs(projectId: string, limit: number): Promise<HandoffView[]> {
      const { data, error } = await db
        .from("handoffs")
        .select("id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 50));
      if (error) throw toStoreError(error);
      return this.getHandoffs(projectId, data.map((h) => h.id));
    },

    /** Handoffs by id, in the order given. Three reads: handoffs, their sources, their claims. */
    async getHandoffs(projectId: string, ids: readonly string[]): Promise<HandoffView[]> {
      if (ids.length === 0) return [];
      const { data: rows, error } = await db
        .from("handoffs")
        .select("id, project_id, source_id, title, area, recipient, summary, next_steps, links, created_at")
        .eq("project_id", projectId)
        .in("id", [...ids]);
      if (error) throw toStoreError(error);

      const [sources, links] = await Promise.all([
        db.from("sources").select("id, author_id, author_label, model, client").in("id", rows.map((r) => r.source_id)),
        db.from("handoff_claims").select("handoff_id, claim_id, position").in("handoff_id", rows.map((r) => r.id)),
      ]);
      if (sources.error) throw toStoreError(sources.error);
      if (links.error) throw toStoreError(links.error);
      const [claims, names] = await Promise.all([
        this.getClaims(links.data.map((l) => l.claim_id)),
        this.namesFor(sources.data.flatMap((s) => (s.author_id ? [s.author_id] : []))),
      ]);
      const claimById = new Map(claims.map((c) => [c.id, c]));
      const sourceById = new Map(sources.data.map((s) => [s.id, s]));

      const byId = new Map(
        rows.map((r): [string, HandoffView] => {
          const s = sourceById.get(r.source_id);
          return [
            r.id,
            {
              id: r.id,
              projectId: r.project_id,
              title: r.title,
              area: r.area,
              recipient: r.recipient,
              summary: r.summary,
              nextSteps: r.next_steps,
              links: Array.isArray(r.links) ? (r.links as { label: string; url: string }[]) : [],
              createdAt: r.created_at,
              provenance: {
                sourceId: r.source_id,
                authorId: s?.author_id ?? null,
                author: (s?.author_id && names.get(s.author_id)) || (s?.author_label ?? "unknown"),
                model: s?.model ?? "unknown",
                client: s?.client ?? "unknown",
              },
              claims: links.data
                .filter((l) => l.handoff_id === r.id)
                .sort((a, b) => a.position - b.position)
                .flatMap((l) => claimById.get(l.claim_id) ?? []),
            },
          ];
        }),
      );
      return ids.flatMap((id) => byId.get(id) ?? []);
    },

    // ---- conflicts -----------------------------------------------------

    /** Conflicts of a project (open ones by default), newest first, with both claims. */
    /** One memory with its history and context. Null if it does not exist or is not visible to the caller. */
    async getClaimDetail(projectId: string, claimId: string): Promise<ClaimDetail | null> {
      const [claim] = await this.getClaims([claimId]);
      if (!claim || claim.projectId !== projectId) return null;
      const [check, edges, conflicts, siblings, handoffLink] = await Promise.all([
        db.from("claim_checks").select("verdict, reason, model, created_at, target_id").eq("claim_id", claimId).maybeSingle(),
        db.from("edges").select("type, from_claim, to_claim, reason, created_by, created_at").eq("project_id", projectId)
          .or(`from_claim.eq.${claimId},to_claim.eq.${claimId}`).order("created_at", { ascending: true }),
        db.from("conflicts").select("id, project_id, claim_a, claim_b, status, reason, resolution, created_at, resolved_at")
          .eq("project_id", projectId).or(`claim_a.eq.${claimId},claim_b.eq.${claimId}`).order("created_at", { ascending: false }),
        db.from("claim_view").select(CLAIM_VIEW_COLUMNS).eq("project_id", projectId).eq("source_id", claim.provenance.sourceId).neq("id", claimId).limit(20),
        db.from("handoff_claims").select("handoff_id").eq("project_id", projectId).eq("claim_id", claimId).limit(1),
      ]);
      for (const r of [check, edges, conflicts, siblings, handoffLink]) if (r.error) throw toStoreError(r.error);

      const otherIds = new Set<string>();
      if (check.data?.target_id) otherIds.add(check.data.target_id);
      for (const e of edges.data ?? []) otherIds.add(e.from_claim === claimId ? e.to_claim : e.from_claim);
      for (const c of conflicts.data ?? []) otherIds.add(c.claim_a === claimId ? c.claim_b : c.claim_a);
      const others = new Map((await this.getClaims([...otherIds])).map((c) => [c.id, c]));
      others.set(claim.id, claim);
      const handoffId = handoffLink.data?.[0]?.handoff_id;
      const [handoff] = handoffId ? await this.getHandoffs(projectId, [handoffId]) : [];

      return {
        claim,
        check: check.data
          ? {
              verdict: check.data.verdict as "new" | "duplicate" | "conflict",
              reason: check.data.reason,
              model: check.data.model,
              createdAt: check.data.created_at,
              target: check.data.target_id ? others.get(check.data.target_id) ?? null : null,
            }
          : null,
        links: (edges.data ?? []).map((e) => ({
          type: e.type,
          direction: e.from_claim === claimId ? ("out" as const) : ("in" as const),
          reason: e.reason,
          byHuman: e.created_by === "human",
          createdAt: e.created_at,
          other: others.get(e.from_claim === claimId ? e.to_claim : e.from_claim) ?? null,
        })),
        conflicts: (conflicts.data ?? []).map((c) => ({
          id: c.id,
          projectId: c.project_id,
          status: c.status as ConflictView["status"],
          reason: c.reason,
          resolution: c.resolution,
          createdAt: c.created_at,
          resolvedAt: c.resolved_at,
          claimA: others.get(c.claim_a) ?? null,
          claimB: others.get(c.claim_b) ?? null,
        })),
        savedWith: (siblings.data ?? []).map(toClaimView),
        handoff: handoff ?? null,
      };
    },

    async listConflicts(projectId: string, status: "open" | "closed" = "open"): Promise<ConflictView[]> {
      let query = db
        .from("conflicts")
        .select("id, project_id, claim_a, claim_b, status, reason, resolution, created_at, resolved_at")
        .eq("project_id", projectId);
      query = status === "open" ? query.eq("status", "open") : query.neq("status", "open");
      const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
      if (error) throw toStoreError(error);
      const claims = await this.getClaims([...new Set(data.flatMap((c) => [c.claim_a, c.claim_b]))]);
      const byId = new Map(claims.map((c) => [c.id, c]));
      return data.map((c) => ({
        id: c.id,
        projectId: c.project_id,
        status: c.status as ConflictView["status"],
        reason: c.reason,
        resolution: c.resolution,
        createdAt: c.created_at,
        resolvedAt: c.resolved_at,
        claimA: byId.get(c.claim_a) ?? null,
        claimB: byId.get(c.claim_b) ?? null,
      }));
    },

    /** A human decision (first-party admin only): keep one claim, or null to keep both. */
    async resolveConflict(conflictId: string, keepClaimId: string | null, note?: string): Promise<void> {
      const { error } = await db.rpc("resolve_conflict", {
        p_conflict: conflictId,
        p_keep: keepClaimId,
        p_note: note || undefined,
      });
      if (error) throw toStoreError(error);
    },

    // ---- branches ------------------------------------------------------

    /** Branches of a project, open ones first then newest, with their draft counts. */
    async listBranches(projectId: string): Promise<BranchView[]> {
      const [{ data: rows, error }, drafts] = await Promise.all([
        db
          .from("branches")
          .select("id, project_id, name, git_branch, status, created_at, closed_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(100),
        db.from("branch_claim_view").select("branch_id").eq("project_id", projectId).limit(5000),
      ]);
      if (error) throw toStoreError(error);
      if (drafts.error) throw toStoreError(drafts.error);
      const counts = new Map<string, number>();
      for (const d of drafts.data) counts.set(d.branch_id!, (counts.get(d.branch_id!) ?? 0) + 1);
      const order = (s: string) => (s === "open" ? 0 : 1);
      return rows
        .map((b) => ({
          id: b.id,
          projectId: b.project_id,
          name: b.name,
          gitBranch: b.git_branch,
          status: (BRANCH_STATUSES as readonly string[]).includes(b.status) ? (b.status as BranchStatus) : "open",
          createdAt: b.created_at,
          closedAt: b.closed_at,
          drafts: counts.get(b.id) ?? 0,
        }))
        .sort((a, b) => order(a.status) - order(b.status));
    },

    /** Draft claims of one branch (by name, case-insensitive), or specific draft ids. Newest first. */
    async getBranchClaims(projectId: string, q: { name?: string; ids?: readonly string[] }): Promise<ClaimView[]> {
      let query = db.from("branch_claim_view").select(CLAIM_VIEW_COLUMNS).eq("project_id", projectId);
      if (q.name) query = query.ilike("branch_name", q.name.replace(/[%_\\]/g, (m) => `\\${m}`));
      if (q.ids) query = query.in("id", [...q.ids]);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
      if (error) throw toStoreError(error);
      return data.map(toClaimView);
    },

    /** Closes the branch and hands each draft to the AI checker. */
    async mergeBranch(projectId: string, name: string): Promise<{ branchId: string; claimsSent: number }> {
      const { data, error } = await db.rpc("merge_branch", { p_project_id: projectId, p_name: name });
      if (error) throw toStoreError(error);
      const row = data[0];
      if (!row) throw new StoreError("unavailable", "merge_branch returned nothing");
      return { branchId: row.branch_id, claimsSent: row.claims_sent };
    },

    /** Closes the branch without merging. Its drafts are kept, never deleted. */
    async abandonBranch(projectId: string, name: string): Promise<void> {
      const { error } = await db.rpc("abandon_branch", { p_project_id: projectId, p_name: name });
      if (error) throw toStoreError(error);
    },

    /** Hybrid semantic + keyword search. Filters are applied in SQL before ranking. */
    async searchClaims(projectId: string, p: SearchParams): Promise<SearchHit[]> {
      const { data, error } = await db.rpc("search_claims", {
        p_project_id: projectId,
        p_query: p.query,
        p_embedding: p.embedding ? JSON.stringify(p.embedding) : undefined,
        p_embedding_model: p.embeddingModel ?? undefined,
        p_types: p.types ? [...p.types] : undefined,
        p_statuses: [...(p.statuses ?? LIVE_STATUSES)],
        p_author_id: p.authorId,
        p_model: p.model,
        p_since: p.since,
        p_limit: Math.min(Math.max(p.limit, 1), LIMITS.searchResults.max),
      });
      if (error) throw toStoreError(error);
      return data.map(toSearchHit);
    },
  };
}
